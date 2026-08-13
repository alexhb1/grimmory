import {TestBed} from '@angular/core/testing';
import {ActivatedRouteSnapshot, Router, RouterStateSnapshot} from '@angular/router';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {UserService} from '../../../features/settings/user-management/user.service';
import {UserStatsGuard} from './user-stats.guard';

describe('UserStatsGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  const router = {
    createUrlTree: vi.fn((commands: string[]) => ({commands})),
  };
  const userService = {
    currentUser: vi.fn<() => {permissions: {admin: boolean; canAccessUserStats: boolean}} | null>(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    router.createUrlTree.mockClear();
    userService.currentUser.mockReset();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {provide: Router, useValue: router},
        {provide: UserService, useValue: userService},
      ]
    });
  });

  it('allows admins through the guard', () => {
    userService.currentUser.mockReturnValue({
      permissions: {
        admin: true,
        canAccessUserStats: false,
      }
    });

    const result = TestBed.runInInjectionContext(() => UserStatsGuard(route, state));

    expect(result).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirects users who cannot access user stats', () => {
    userService.currentUser.mockReturnValue({
      permissions: {
        admin: false,
        canAccessUserStats: false,
      }
    });

    const result = TestBed.runInInjectionContext(() => UserStatsGuard(route, state));

    expect(result).toEqual({commands: ['/dashboard']});
    expect(router.createUrlTree).toHaveBeenCalledWith(['/dashboard']);
  });
});
