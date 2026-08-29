# XKIMI XA MALI
## Platform & Architecture Audit Report

**Domain:** xkimixamali.co.za  
**Audit Date:** 28 August 2026  
**Environment:** Vercel Production Infrastructure  
**Status:** Active deployment — remediation required

---

## 1. Executive Summary

The Xkimi Xa Mali production deployment infrastructure is active on **Vercel**, with public DNS propagation underway.

The audit identified several infrastructure and deployment concerns requiring attention before the platform can be considered fully stable:

1. An outstanding **domain-registration validation requirement** with Domains.co.za.
2. Critical startup failures affecting specific performance/development branches.
3. Missing production environment variables required for SMS and email functionality.
4. Missing/unconfigured error-tracking integration.
5. A previously identified security issue involving credential exposure during rendering, which has reportedly been patched and requires continued production monitoring.

The most urgent operational issue is the registrar verification requirement because failure to provide the requested physical-address information may result in the domain entering a **`clientHold`** status, potentially taking the website offline.

---

# 2. Infrastructure & Registrar Status

### 2.1 Domain Registration

**Domain:** xkimixamali.co.za  
**Registrar:** Domains.co.za  
**Registration Date:** 28 August 2026

The domain has been successfully registered.

### 2.2 Registrar Compliance Requirement

An urgent administrative ticket is reportedly pending with Domains.co.za requesting verification of the account holder's **full physical address**.

### Required action

Submit the requested address information and supporting proof to the registrar as soon as possible.

### Risk

Failure to satisfy the registrar's verification requirement may result in the domain being placed into:

**`clientHold`**

A client-hold status can prevent normal DNS resolution and therefore make the website inaccessible.

### Priority

**CRITICAL**

---

# 3. DNS & Network Status

The domain's DNS configuration is routing traffic toward Vercel.

**Observed Vercel IPv4:** `76.76.21.21`

Public DNS propagation is underway.

Intermittent access issues observed on some mobile networks are attributed to DNS/ISP caching and propagation behaviour.

### Expected resolution window

Approximately **24–48 hours**, although actual propagation can vary depending on DNS caching and resolver behaviour.

### Verification required

After propagation:

- [ ] Domain resolves consistently.
- [ ] HTTPS certificate is valid.
- [ ] `www`/root-domain behaviour is correct where configured.
- [ ] Vercel deployment responds consistently.
- [ ] DNS records match the intended production configuration.
- [ ] Mobile and desktop networks can access the platform.
- [ ] No unexpected redirects occur.

---

# 4. GitHub Repository & Build Analysis

The codebase managed by the **ksdrill** team contains development/performance branches exhibiting deployment instability.

### Affected branches

- `perf/website-performance`
- `feat/phase-10-performance`

### Observed issue

Both branches reportedly experience persistent startup crashes during the Vercel build/deployment process.

### Required investigation

Review:

- Vercel build logs.
- Serverless-function initialization.
- Environment-variable availability.
- Build-time versus runtime configuration.
- Dependency/import failures.
- Server/client boundary issues.
- Performance-related code introduced by the affected branches.
- Differences between the stable production branch and failing branches.

### Priority

**HIGH**

---

# 5. Security Hotfix Verification

Recent pull requests reportedly addressed a severe hydration/rendering race condition involving password-related sub-forms.

### Reported vulnerability

During rendering, password-related information was reportedly being exposed through URL parameters.

### Current status

**Reportedly patched.**

### Required verification

The production environment must be tested to confirm that:

- Passwords never appear in URLs.
- Passwords never appear in query parameters.
- Passwords are not exposed through client-side routing.
- Password values are not accidentally rendered into HTML.
- Password values are not written to browser history.
- Sensitive credentials are not included in logs.
- The patch remains present in the production branch.
- Regression testing prevents the vulnerability from returning.

### Priority

**CRITICAL SECURITY VERIFICATION**

---

# 6. Production Environment Variables

The runtime application is reportedly missing required environment configuration.

These values must be configured through the appropriate **Vercel project environment settings**, rather than committed directly into source control.

| Subsystem | Required Configuration | Impact |
|---|---|---|
| SMS Gateway | `BULKSMS_USERNAME` | SMS authentication unavailable |
| SMS Gateway | `BULKSMS_PASSWORD` | SMS authentication unavailable |
| Email Gateway | `RESEND_API_KEY` | Transactional email unavailable |
| Error Tracking | Sentry integration keys | Runtime failures may not be captured |

---

# 7. SMS Gateway

### Required variables

- `BULKSMS_USERNAME`
- `BULKSMS_PASSWORD`

### Dependent functionality

- One-Time Passwords (OTPs)
- SMS alerts
- Potential transaction/member notifications

### Failure impact

If these credentials are unavailable or invalid:

**Xkimi Xa Mali → SMS Gateway → delivery**

will fail.

### Required tests

- [ ] OTP generation.
- [ ] OTP dispatch.
- [ ] OTP verification.
- [ ] Invalid OTP handling.
- [ ] Expired OTP handling.
- [ ] SMS failure handling.
- [ ] No sensitive information unnecessarily included in SMS content.
- [ ] Duplicate SMS prevention where applicable.

---

# 8. Email Gateway

### Required variable

`RESEND_API_KEY`

### Dependent functionality

- Account-related emails.
- Transactional notifications.
- Receipts.
- Other system-generated emails.

### Required tests

- [ ] Account email.
- [ ] Transaction notification.
- [ ] Receipt delivery.
- [ ] Invalid recipient handling.
- [ ] Provider/API failure handling.
- [ ] Duplicate email prevention.
- [ ] Email content accuracy.
- [ ] Sensitive information handling.

---

# 9. Error Tracking

### Current concern

Sentry integration keys are reportedly missing or unconfigured.

### Impact

Application crashes and runtime errors may occur without being centrally captured and monitored.

This reduces visibility into production failures and makes troubleshooting significantly harder.

### Required actions

Configure the appropriate Sentry integration for the production environment.

### Verify

- [ ] Runtime exceptions appear in Sentry.
- [ ] Server-side failures are captured.
- [ ] Client-side failures are captured where intended.
- [ ] Sensitive information is not unnecessarily transmitted.
- [ ] Production environment is correctly identified.
- [ ] Source maps/configuration are handled appropriately.
- [ ] Alerts are configured for critical failures.

---

# 10. Required Action Plan

## Priority 1 — Protect Domain Availability

**Action:** Resolve the Domains.co.za physical-address verification request.

**Reason:** Prevent possible `clientHold` status and loss of domain accessibility.

**Status:** Pending

---

## Priority 2 — Configure Production Secrets

Configure the required production environment variables through Vercel.

### SMS
- `BULKSMS_USERNAME`
- `BULKSMS_PASSWORD`

### Email
- `RESEND_API_KEY`

### Error tracking
- Sentry production configuration

**Status:** Pending

---

## Priority 3 — Investigate Performance-Branch Crashes

Investigate:

`feat/phase-10-performance`

and

`perf/website-performance`

using Vercel deployment/build logs.

Identify whether the failures originate from:

- Application initialization.
- Serverless functions.
- Environment configuration.
- Dependencies.
- Performance changes.
- Client/server execution boundaries.
- Runtime configuration.

**Status:** Pending

---

## Priority 4 — Verify Security Hotfix

Perform regression testing against the previously identified credential-exposure issue.

**Status:** Patched — production verification required

---

# 11. Production Readiness Checklist

### Domain & DNS

- [ ] Registrar verification completed.
- [ ] No pending `clientHold` risk.
- [ ] DNS propagation complete.
- [ ] Root domain resolves correctly.
- [ ] Required subdomains resolve correctly.
- [ ] HTTPS works correctly.
- [ ] Domain redirects verified.

### Deployment

- [ ] Production branch builds successfully.
- [ ] Production deployment starts successfully.
- [ ] No startup crashes.
- [ ] Serverless functions initialize correctly.
- [ ] Runtime environment is correctly configured.

### Environment

- [ ] SMS credentials configured.
- [ ] Email credentials configured.
- [ ] Sentry configured.
- [ ] Secrets are not committed to Git.
- [ ] Production and development variables are separated appropriately.

### Security

- [ ] Credential-exposure hotfix verified.
- [ ] Passwords never appear in URLs.
- [ ] Sensitive data is excluded from logs.
- [ ] Authentication flows tested.
- [ ] Authorization flows tested.
- [ ] Production secrets protected.

### Monitoring

- [ ] Runtime errors captured.
- [ ] Critical alerts configured.
- [ ] Failed deployments visible.
- [ ] Payment/integration failures observable.
- [ ] Logs contain sufficient diagnostic information without exposing sensitive data.

---

# 12. Final Assessment

### Current State

**Production infrastructure:** ACTIVE  
**Domain:** REGISTERED  
**DNS:** PROPAGATING  
**Payment/financial integration:** UNDER ONBOARDING/FINALIZATION  
**Environment configuration:** INCOMPLETE  
**Performance branches:** UNSTABLE  
**Security hotfix:** PATCHED — REQUIRES PRODUCTION VERIFICATION  
**Monitoring:** INCOMPLETE

### Overall Classification

**NOT YET PRODUCTION-READY**

This does not necessarily indicate a fundamental architectural failure. The outstanding issues are primarily **deployment, configuration, operational reliability, monitoring, and verification concerns**.

The platform should proceed to production only after the critical issues have been resolved and the corresponding tests have been successfully signed off.

---

## Engineering Principle

> **A production system is not finished when it successfully deploys. It is finished when its infrastructure, security, integrations, monitoring, failure handling, and recovery mechanisms have all been verified.**

**Prepared for:** Xkimi Xa Mali  
**Audit date:** 28 August 2026