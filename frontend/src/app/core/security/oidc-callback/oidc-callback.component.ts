import {Component, ErrorHandler, inject, OnInit} from '@angular/core';
import {Router} from '@angular/router';
import {TranslocoPipe} from '@jsverse/transloco';
import {OidcService} from '../oidc.service';
import {AuthService} from '../../../shared/service/auth.service';
import {getApiErrorMessage} from '../../../shared/models/api-exception.model';

@Component({
  selector: 'app-oidc-callback',
  templateUrl: './oidc-callback.component.html',
  styleUrls: ['./oidc-callback.component.scss'],
  imports: [TranslocoPipe]
})
export class OidcCallbackComponent implements OnInit {
  private router = inject(Router);
  private oidcService = inject(OidcService);
  private authService = inject(AuthService);
  private errorHandler = inject(ErrorHandler);

  ngOnInit(): void {
    const params = new URLSearchParams(window.location.search);

    const error = params.get('error');
    if (error) {
      const description = params.get('error_description') || error;
      console.error('[OIDC Callback] Provider returned error:', error, description);
      this.redirectToLogin(description);
      return;
    }

    const code = params.get('code');
    const returnedState = params.get('state');

    if (!code || !returnedState) {
      console.error('[OIDC Callback] Missing code or state');
      this.redirectToLogin('missing_code');
      return;
    }

    const pkceState = this.oidcService.retrievePkceState(returnedState);
    if (!pkceState) {
      console.error('[OIDC Callback] No PKCE state found for state parameter');
      this.redirectToLogin('missing_pkce_state');
      return;
    }

    if (returnedState !== pkceState.state) {
      console.error('[OIDC Callback] State mismatch');
      this.redirectToLogin('state_mismatch');
      return;
    }

    this.oidcService.exchangeCode(code, pkceState.codeVerifier, pkceState.nonce, pkceState.state).subscribe({
      next: (response) => {
        sessionStorage.removeItem('oidc_redirect_count');
        this.authService.saveInternalTokens(response.accessToken, response.refreshToken, response.expires, response.isDefaultPassword);
        this.authService.initializeWebSocketConnection();
        const destination = response.isDefaultPassword ? '/change-password' : '/dashboard';
        void this.router.navigate([destination]).catch((error: unknown) => this.errorHandler.handleError(error));
      },
      error: (error: unknown) => {
        console.error('[OIDC Callback] Token exchange failed', error);
        const errorMessage = getApiErrorMessage(error, 'exchange_failed');
        this.redirectToLogin(errorMessage);
      }
    });
  }

  private redirectToLogin(oidcError: string): void {
    void this.router.navigate(['/login'], {queryParams: {oidcError}})
      .catch((error: unknown) => this.errorHandler.handleError(error));
  }
}
