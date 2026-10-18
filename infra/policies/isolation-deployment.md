# Infrastructure Policy: Isolation Deployment & Container Sandboxing

**Policy Document ID:** POL-INFRA-G5-002  
**Gate:** Gate 5 (Public Hardening & Scale)  
**Applicability:** TeX Execution Engine, Background Jobs Service, Production Container Deployments.

---

## 1. Purpose & Core Guarantees

This document establishes the production deployment configuration for isolated TeX executor adapters (`IsolatedCompilerExecutor` in `apps/jobs/src/compilation/isolated-executor.ts`), operationalizing the architecture defined in [ADR-011](../../docs/adr/011-public-executor.md).

Core Guarantees:
1. **Network Denial:** Zero egress/ingress network connectivity inside compilation sub-processes.
2. **Ephemeral Mounts:** Dedicated temporary directories wiped immediately upon process exit.
3. **Least Privilege:** Non-root execution with dropped capabilities (`cap_drop=ALL`) and `no-new-privileges`.
4. **Secret Stripping:** Strict environment variable whitelist expunging all database, cache, storage, and authentication keys.
5. **Deterministic Boundaries:** Enforced timeouts (30s) and memory caps (512 MiB) with clean failure handling.

---

## 2. Docker / Compose Deployment Configuration

For local development and self-hosted environments using Docker Compose, the isolated executor container specification is:

```yaml
services:
  tex-executor-isolated:
    image: texlive/texlive:latest
    container_name: latex_tex_isolated
    read_only: true
    user: "10001:10001"
    network_mode: "none"
    security_opt:
      - no-new-privileges:true
      - seccomp:unconfined # Or custom restricted profile
    cap_drop:
      - ALL
    mem_limit: 512m
    memswap_limit: 512m
    cpus: 1.0
    pids_limit: 64
    tmpfs:
      - /tmp:rw,noexec,nosuid,size=100m
    environment:
      - LANG=C.UTF-8
      - LC_ALL=C.UTF-8
      - PATH=/usr/bin:/bin:/usr/local/bin
    volumes:
      - /usr/share/texlive:/usr/share/texlive:ro
      - /var/lib/texmf:/var/lib/texmf:ro
    restart: unless-stopped
```

---

## 3. Sandboxing Verification & Audit Checklist

The deployment pipeline validates the following runtime checks prior to enabling untrusted compilation:

1. **Network Check:** Execution of socket connection inside sandbox container fails with `ENETUNREACH`.
2. **Filesystem Check:** Attempt to write to `/usr`, `/etc`, or outside `/tmp` fails with `EROFS`.
3. **Secret Check:** `/proc/$PID/environ` contains only `PATH`, `HOME`, `TMPDIR`, `LANG`, `LC_ALL`, `TEXMFCNF`. Zero instances of `DATABASE_URL`, `REDIS_URL`, `MINIO_SECRET_KEY`, or `JWT_SECRET`.
4. **Resource Check:** High-memory stress job triggers SIGKILL via cgroup OOM killer without affecting host stability.
5. **Engine Flag Check:** `latexmk` invocations strictly enforce `-no-shell-escape`.
