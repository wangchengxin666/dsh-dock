# DSH plugins

Harness plugins that ship with this platform. Each directory is a DSH **bundle**:
a package whose `package.json` declares `dsh.bundle.patch` and whose patch
inserts the plugin rows into a profile.

| Plugin | What it adds |
|---|---|
| [file-manager](file-manager/README.md) | A server file manager page in the left sidebar: breadcrumbs and a path bar, upload, download (including ZIP of a directory or selection), inline preview, new folder, rename, delete. |

## Self-Hosted Discover Index & Registry (via `dsh-manager`)

`dsh-manager` natively hosts this `plugins/` directory with zero external S3/MinIO or Git credential requirements:

| Endpoint | Purpose |
|---|---|
| `http://<manager>:9000/plugins/index.json` | Discover index URL (add under **Plugins → Discover → Add index source**) |
| `http://<manager>:9000/plugins/icons/<name>.svg` | Plugin icons referenced by `index.json` |
| `http://<manager>:9000/plugins/npm/<package>` | Built-in read-only npm registry used by Discover when `PLUGIN_SOURCE_TYPE=npm` |
| `http://<manager>:9000/plugins/packages/<slug>.tgz` | Direct tarball download for CLI installation |

### Automatic installation into sandboxes

In `manager/.env`, set:

```dotenv
SANDBOX_AUTO_INSTALL_PLUGINS=file-manager
```

Every sandbox created by the manager will automatically install `file-manager` from the manager's `/plugins/packages/file-manager.tgz` endpoint during first startup.

### Manual installation inside a sandbox

```sh
# From the manager's self-hosted tarball endpoint:
dsh plugin --profile web add http://<manager>:9000/plugins/packages/file-manager.tgz

# Or from a local directory checkout:
dsh plugin --profile web add /workspace/dsh-sandbox/plugins/file-manager
```

## Developing a plugin

Each plugin builds and tests standalone; `file-manager` for example:

```sh
cd plugins/file-manager
node scripts/build.mjs       # rebuild client.js, then run every check
```

Because `dsh-manager` dynamically packages `plugins/<slug>/` into a `.tgz` and refreshes its SHA-1 / SHA-512 integrity whenever files in `plugins/<slug>/` change, updating a plugin on disk immediately updates the package served by `dsh-manager`.

## Optional: Publishing to an external S3/MinIO bucket or Git source

If you prefer hosting `plugins/index.json` and `plugins/icons/*` on an external S3/MinIO bucket with a Git source instead of `dsh-manager`:

1. Set `PLUGIN_SOURCE_TYPE=git`, `PLUGIN_GIT_URL=https://...`, and `PLUGIN_GIT_COMMIT=<sha>` in `manager/.env` (or edit `plugins/index.json`), or
2. Upload `plugins/index.json` and `plugins/icons/*` to your bucket with `--cache-control no-cache`.
