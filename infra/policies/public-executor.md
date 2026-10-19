# Infrastructure Policy: Public & Untrusted TeX Executor Isolation

**Policy Document ID:** POL-INFRA-G5-001  
**Gate:** Gate 5 (Public Hardening & Isolation)  
**Applicability:** TeX Execution Service (`apps/tex-executor`), Background Workers (`apps/jobs`), Local Container Infra (`infra/docker-compose.yml`), CI/CD Pipelines.

---

## 1. Scope & Objective

This policy defines the mandatory security controls, sandboxing boundaries, and resource limits governing untrusted and public LaTeX compilation workloads on the platform.

All untrusted user source code compilation MUST execute under the constraints specified below. Violation of any constraint constitutes a Critical Security Incident.

---

## 2. Mandatory Isolation Controls

### 2.1 Network Isolation

- **Rule:** The execution container or sandbox MUST NOT possess an external network interface.
- **Specification:**
  - Docker / Compose: `network_mode: none`.
  - Bubblewrap / Namespace: `--unshare-net`.
  - DNS: No `/etc/resolv.conf` entry or DNS lookup daemon accessible.
- **Verification:** Network socket creation (`socket(AF_INET, ...)`) returns `ENETUNREACH` or is blocked by seccomp filters.

### 2.2 Mount & Filesystem Isolation

- **Rule:** The host filesystem MUST NEVER be mounted read-write. TeX Live assets MUST be mounted read-only. Working directories MUST be ephemeral.
- **Specification:**
  - Root Filesystem (`/`): `read_only: true`.
  - TeX Live Trees (`/usr/share/texlive`, `/var/lib/texmf`): Mounted `:ro`.
  - Working Directory (`/tmp/compile-job-{uuid}`): Ephemeral `tmpfs` mounted with `noexec,nodev,nosuid` (or restricted binary execution), capped at `100m`.
  - Storage Cleanup: Explicit shred/rmdir upon process termination.
- **Verification:** Attempts to write to `/`, `/usr`, `/etc`, or outside `/tmp` fail with `EROFS` (Read-only file system).

### 2.3 Process & Privilege Sandboxing

- **Rule:** Execution MUST NOT run as root (UID 0) and MUST NOT allow privilege escalation.
- **Specification:**
  - Runner User: Non-root dedicated user UID `10001`, GID `10001`.
  - Capabilities: `cap_drop: [ "ALL" ]`. Zero Linux capabilities granted.
  - Privilege Escalation: `security_opt: [ "no-new-privileges:true" ]`.
  - Seccomp Profile: `security_opt: [ "seccomp=default" ]` with disallowed kernel syscalls (`ptrace`, `bpf`, `syslog`, `mount`).
- **Verification:** `id -u` inside executor returns `10001`; `setuid` binaries fail.

### 2.4 Resource Limits (cgroup v2 & Engine Limits)

- **Rule:** Every compilation job MUST have strict upper bounds on CPU, memory, PIDs, and wall-clock execution time.
- **Specification:**
  - CPU Limit: `cpus: 1.0` (100% of single CPU core max).
  - Memory Limit: `mem_limit: 512m` (512 MiB maximum). Swap disabled or `memswap_limit: 512m`.
  - Process Limit: `pids_limit: 64`.
  - Wall-Clock Timeout: 30 seconds strict timeout enforced by executor watcher (`SIGTERM` followed by `SIGKILL` after 2s grace).
  - Maximum Output Size: Log file <= 5 MiB, output PDF <= 50 MiB.
- **Verification:** Infinite loop macros terminate at 30 seconds; memory bombs trigger OOM kill cleanly.

### 2.5 Secret Stripping & Environment Isolation

- **Rule:** No operational secrets or ambient credentials may enter compilation sub-processes.
- **Specification:**
  - Permitted Environment Variables: `PATH`, `HOME`, `TMPDIR`, `TEXMFCNF`, `LC_ALL`, `LANG`.
  - Blocked Patterns: `*DATABASE*`, `*REDIS*`, `*MINIO*`, `*AWS*`, `*SECRET*`, `*TOKEN*`, `*KEY*`, `*PASSWORD*`.
- **Verification:** Inspection of `/proc/$PID/environ` reveals zero database, storage, or auth tokens.

---

## 3. Adversarial Test Protocol Checklist

Before approving any public compile release, the test suite MUST execute the following adversarial vectors and confirm safe containment:

| Vector ID  | Description                               | Expected Behavior                                                                                                       |
| ---------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **ADV-01** | `\immediate\write18{id}` shell escape     | Compilation succeeds or logs error, but shell command is NOT executed (`-no-shell-escape` active).                      |
| **ADV-02** | `\input{/etc/passwd}` directory traversal | File is not included; compilation fails with file not found or permission error; zero system text leaked in log or PDF. |
| **ADV-03** | `\loop \repeat` infinite loop             | Process killed at 30-second timeout; returns `TIMEOUT` status safely.                                                   |
| **ADV-04** | Large token accumulation memory bomb      | Process killed by OOM or memory limit; returns `OUT_OF_MEMORY` status safely.                                           |
| **ADV-05** | Network curl attempt                      | Fails immediately with network unreachable.                                                                             |
