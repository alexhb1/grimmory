package org.booklore.service.kobo;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;

class KepubConversionServiceTest {
    private static final String CONTAINER = """
            <?xml version="1.0" encoding="UTF-8"?>
            <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
              <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
            </container>
            """;

    private static final String OPF = """
            <?xml version="1.0" encoding="UTF-8"?>
            <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
              <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                <dc:identifier id="uid">test</dc:identifier><dc:title>Test</dc:title><dc:language>en</dc:language>
              </metadata>
              <manifest>
                <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
                <item id="unicode" href="%E4%B8%80.xhtml" media-type="application/xhtml+xml"/>
                <item id="style" href="style.css" media-type="text/css"/>
                <item id="font" href="fonts/embedded.otf" media-type="application/vnd.ms-opentype"/>
              </manifest>
              <spine><itemref idref="chapter"/><itemref idref="unicode"/></spine>
            </package>
            """;

    private static final String CHAPTER = """
            <?xml version="1.0" encoding="UTF-8"?>
            <html xmlns="http://www.w3.org/1999/xhtml"><head><title>c</title></head>
            <body><p>A sentence.</p></body></html>
            """;

    private static final String STYLESHEET = "body { margin: 1em; }\n";
    private static final byte[] FONT = {(byte) 0x4F, (byte) 0x54, (byte) 0x54, (byte) 0x4F, 9, 9, 9};
    private static final byte[] ENCRYPTION =
            "<encryption xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"/>".getBytes(StandardCharsets.UTF_8);

    private KepubConversionService service;

    @BeforeEach
    void setUp() {
        service = new KepubConversionService(new KepubHtmlConversionService());
    }

    @Test
    void conversionKeepsEveryEntryFromTheSourceBook(@TempDir Path tempDir) throws IOException {
        Map<String, byte[]> source = book();

        Map<String, byte[]> converted = read(service.convertEpubToKepub(write(tempDir, source), tempDir.toFile(), false));

        assertThat(converted.keySet()).containsAll(source.keySet());
    }

    @Test
    void conversionKeepsFontObfuscationDeclarations(@TempDir Path tempDir) throws IOException {
        Map<String, byte[]> converted = read(service.convertEpubToKepub(write(tempDir, book()), tempDir.toFile(), false));

        assertThat(converted.get("META-INF/encryption.xml")).isEqualTo(ENCRYPTION);
    }

    @Test
    void conversionKeepsNonAsciiEntryNamesReadable(@TempDir Path tempDir) throws IOException {
        Map<String, byte[]> converted = read(service.convertEpubToKepub(write(tempDir, book()), tempDir.toFile(), false));

        assertThat(converted.keySet()).contains("OEBPS/一.xhtml");
        assertThat(new String(converted.get("OEBPS/一.xhtml"), StandardCharsets.UTF_8)).contains("koboSpan");
    }

    @Test
    void convertedBookKeepsTheSourceFilename(@TempDir Path tempDir) throws IOException {
        File output = service.convertEpubToKepub(write(tempDir, book()), tempDir.toFile(), false);

        assertThat(output.getName()).isEqualTo("book.kepub.epub");
    }

    private Map<String, byte[]> book() {
        Map<String, byte[]> entries = new LinkedHashMap<>();
        entries.put("mimetype", "application/epub+zip".getBytes(StandardCharsets.US_ASCII));
        entries.put("META-INF/container.xml", CONTAINER.getBytes(StandardCharsets.UTF_8));
        entries.put("META-INF/encryption.xml", ENCRYPTION);
        entries.put("OEBPS/content.opf", OPF.getBytes(StandardCharsets.UTF_8));
        entries.put("OEBPS/chapter.xhtml", CHAPTER.getBytes(StandardCharsets.UTF_8));
        entries.put("OEBPS/一.xhtml", CHAPTER.getBytes(StandardCharsets.UTF_8));
        entries.put("OEBPS/style.css", STYLESHEET.getBytes(StandardCharsets.UTF_8));
        entries.put("OEBPS/fonts/embedded.otf", FONT);
        return entries;
    }

    private File write(Path directory, Map<String, byte[]> entries) throws IOException {
        Path source = Files.createDirectories(directory.resolve("source"));
        File epub = source.resolve("book.epub").toFile();

        try (ZipOutputStream output = new ZipOutputStream(Files.newOutputStream(epub.toPath()))) {
            for (var entry : entries.entrySet()) {
                output.putNextEntry(new ZipEntry(entry.getKey()));
                output.write(entry.getValue());
                output.closeEntry();
            }
        }

        return epub;
    }

    private Map<String, byte[]> read(File epub) throws IOException {
        Map<String, byte[]> entries = new LinkedHashMap<>();

        try (ZipFile zipFile = new ZipFile(epub)) {
            for (ZipEntry entry : zipFile.stream().toList()) {
                try (var input = zipFile.getInputStream(entry);
                     var buffer = new ByteArrayOutputStream()) {
                    input.transferTo(buffer);
                    entries.put(entry.getName(), buffer.toByteArray());
                }
            }
        }

        return entries;
    }
}
