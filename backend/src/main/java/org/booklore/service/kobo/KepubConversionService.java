package org.booklore.service.kobo;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.grimmory.epub4j.domain.Book;
import org.grimmory.epub4j.domain.Resource;
import org.grimmory.epub4j.epub.EpubReader;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

@Slf4j
@Service
@RequiredArgsConstructor
public class KepubConversionService {
    private static final String MIMETYPE_ENTRY = "mimetype";

    private static final Set<String> HTML_MEDIA_TYPES = Set.of(
            "text/html",
            "application/xhtml",
            "application/xhtml+xml"
    );

    private static final Set<String> IGNORED_FILENAMES = Set.copyOf(
            Stream.of(
                ".DS_STORE",
                "iTunesMetadata.plist",
                "iTunesArtwork.plist",
                "calibre_bookmarks.txt",
                "thumbs.db"
            ).map(String::toLowerCase).toList()
    );

    private static final Set<String> IGNORED_DIRECTORIES = Set.copyOf(
            Stream.of(
                "__MACOSX"
            ).map(String::toLowerCase).toList()
    );

    private final KepubHtmlConversionService kepubHtmlConversionService;

    public File convertEpubToKepub(File epubFile, File tempDir, boolean forceEnableHyphenation) throws IOException {
        validateInputs(epubFile);

        Path outputPath = tempDir.toPath().resolve(kepubFilename(epubFile));
        convertEpubToKepub(epubFile, outputPath, forceEnableHyphenation);

        log.info(
                "Successfully converted {} to {} (size: {} bytes)",
                epubFile.getName(),
                outputPath.getFileName(),
                Files.size(outputPath)
        );

        return outputPath.toFile();
    }

    private void convertEpubToKepub(File epubFile, Path outputPath, boolean forceEnableHyphenation) throws IOException {
        Book book;

        try (InputStream inputStream = Files.newInputStream(epubFile.toPath())) {
            book = new EpubReader().readEpub(inputStream);
        }

        String opfEntry = book.getOpfResource() == null ? null : book.getOpfResource().getHref();
        Set<String> htmlEntries = htmlEntries(book, directoryOf(opfEntry));
        String coverHref = book.getCoverImage() == null ? null : book.getCoverImage().getHref();

        try (ZipFile source = new ZipFile(epubFile);
             ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(outputPath))) {

            writeMimetype(source, output);

            for (ZipEntry entry : Collections.list(source.entries())) {
                String name = entry.getName();

                if (entry.isDirectory() || MIMETYPE_ENTRY.equals(name) || !isIncludedResource(name)) {
                    continue;
                }

                byte[] data = read(source, entry);

                if (htmlEntries.contains(name)) {
                    data = kepubHtmlConversionService
                            .transform(new String(data, StandardCharsets.UTF_8), forceEnableHyphenation)
                            .getBytes(StandardCharsets.UTF_8);
                } else if (name.equals(opfEntry)) {
                    data = addCoverImageProperty(data, coverHref);
                }

                output.putNextEntry(new ZipEntry(name));
                output.write(data);
                output.closeEntry();
            }
        }
    }

    private Set<String> htmlEntries(Book book, String opfDirectory) {
        Set<String> entries = new HashSet<>();

        for (Resource resource : book.getResources().getAll()) {
            String mediaType = getMediaType(resource);

            if (resource.getHref() == null || mediaType == null || !HTML_MEDIA_TYPES.contains(mediaType)) {
                continue;
            }

            entries.add(opfDirectory + resource.getHref());
        }

        return entries;
    }

    /**
     * Adds the cover-image property to the cover item in the OPF manifest.
     * Kobo devices will only support the EPUB3 "properties" attribute with
     * the `cover-image` tag.
     * <a href="https://www.w3.org/TR/epub-33/#sec-item-resource-properties">
     *     Read more on the EPUB3 spec.
     * </a>
     */
    byte[] addCoverImageProperty(byte[] opfData, String coverHref) {
        if (coverHref == null) {
            return opfData;
        }

        String opf = new String(opfData, StandardCharsets.UTF_8);
        Matcher item = Pattern
                .compile("<item\\b[^>]*\\bhref=\"" + Pattern.quote(coverHref) + "\"[^>]*>")
                .matcher(opf);

        if (!item.find() || item.group().contains("properties=")) {
            return opfData;
        }

        String patched = item.group().replaceFirst("\\s*/?>$", " properties=\"cover-image\"/>");

        return (opf.substring(0, item.start()) + patched + opf.substring(item.end()))
                .getBytes(StandardCharsets.UTF_8);
    }

    private void writeMimetype(ZipFile source, ZipOutputStream output) throws IOException {
        ZipEntry mimetype = source.getEntry(MIMETYPE_ENTRY);
        byte[] data = mimetype == null
                ? "application/epub+zip".getBytes(StandardCharsets.US_ASCII)
                : read(source, mimetype);

        CRC32 crc = new CRC32();
        crc.update(data);

        ZipEntry entry = new ZipEntry(MIMETYPE_ENTRY);
        entry.setMethod(ZipEntry.STORED);
        entry.setSize(data.length);
        entry.setCompressedSize(data.length);
        entry.setCrc(crc.getValue());

        output.putNextEntry(entry);
        output.write(data);
        output.closeEntry();
    }

    private byte[] read(ZipFile zipFile, ZipEntry entry) throws IOException {
        try (InputStream inputStream = zipFile.getInputStream(entry)) {
            return inputStream.readAllBytes();
        }
    }

    private String directoryOf(String entryName) {
        return entryName != null && entryName.contains("/")
                ? entryName.substring(0, entryName.lastIndexOf('/') + 1)
                : "";
    }

    private String kepubFilename(File epubFile) {
        String name = epubFile.getName();
        int extension = name.lastIndexOf('.');

        return (extension > 0 ? name.substring(0, extension) : name) + ".kepub.epub";
    }

    private String getMediaType(Resource resource) {
        if (resource == null || resource.getMediaType() == null) {
            return null;
        }

        return resource.getMediaType().toString().toLowerCase();
    }

    private boolean isIncludedResource(String entryName) {
        // Because this isn't an actual filesystem it's always "/"
        String[] parts = entryName.split("/");

        if (parts.length == 0) {
            // No empty HREF items allowed.
            return false;
        }

        if (IGNORED_FILENAMES.contains(parts[parts.length - 1].toLowerCase())) {
            return false;
        }

        // Check everything except the "filename" (the last entry)
        for (int i = 0; i < parts.length - 1; i++) {
            if (IGNORED_DIRECTORIES.contains(parts[i].toLowerCase())) {
                return false;
            }
        }

        return true;
    }

    private void validateInputs(File epubFile) {
        if (epubFile == null || !epubFile.isFile()) {
            throw new IllegalArgumentException("Invalid EPUB file: " + epubFile);
        }
    }
}
