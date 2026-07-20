# Proinsur/Numa demo operations

The current Proinsur demo keeps the historical `numa` technical identifiers. Its
installed runtime must live under `/opt/kern/installations/proinsur-demo`; do not bind
runtime configuration or mutable state directly from the source worktree, because that
worktree is on NFS and may not be mounted when Docker starts after a Spark reboot.

`kern-proinsur-demo.service` starts the local PostgreSQL container, waits for it to
accept connections, starts the Kern runtime, and applies the OpenWebUI network override.
OpenWebUI reaches Kern over the private `kern_numa_internal` Docker network at
`http://kern-numa:8787/v1`; no host port is published.

The installed runtime config must be readable by the image's unprivileged Node user
(UID 1000). Install it as UID 1000 with mode `0400`; the environment file stays owned by
root with mode `0600` because Docker Compose reads it before starting the container.

The installation-specific `runtime.installation.json` must allow the private Docker
subnet as a CIDR instead of pinning a container IP, because container IPs may change
after a reboot. Secrets and real installation configuration remain outside Git.

Operational checks:

```bash
systemctl status kern-proinsur-demo.service
sudo docker exec openwebui python -c \
  'import urllib.request; print(urllib.request.urlopen("http://kern-numa:8787/v1/models", timeout=5).read().decode())'
```
