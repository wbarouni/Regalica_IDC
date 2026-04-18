import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

import { AppComponent, HealthResponse } from './app.component';

describe('AppComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('creates and exposes initial loading state', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const cmp = fixture.componentInstance;
    expect(cmp).toBeTruthy();
    expect(cmp.loading()).toBeTrue();
    expect(cmp.health()).toBeNull();
    expect(cmp.error()).toBeNull();

    fixture.detectChanges();

    const mockHealth: HealthResponse = {
      status: 'ok',
      service: 'regalica-api',
      version: '0.0.0',
      uptime: 1.2,
      timestamp: new Date().toISOString(),
    };
    httpTesting.expectOne('/api/health').flush(mockHealth);

    expect(cmp.loading()).toBeFalse();
    expect(cmp.health()).toEqual(mockHealth);
    expect(cmp.error()).toBeNull();
  });
});
