import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { API_CONFIG } from '../../../core/config/api-config';

@Injectable({
  providedIn: 'root',
})
export class LoginGuard implements CanActivate {
  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/setup`;
  private http = inject(HttpClient);
  private router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    return this.http.get<{ data: boolean }>(`${this.url}/status`).pipe(
      map(res => {
        if (!res.data) {
          return this.router.createUrlTree(['/setup']);
        }
        return true;
      }),
      catchError(() => of(this.router.createUrlTree(['/setup'])))
    );
  }
}
