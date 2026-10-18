# Release privacy checks

Player downloads are built from an explicit file allowlist. They exclude local environment files, credentials, careers, databases, logs, development history, generated match speech and voice-training source material. The recorded match voice bank and the two neutral voice profiles are included.

The release checks search source and packaged metadata for the local environment secret values, common API-token formats and developer machine paths. Python bytecode caches are excluded from the portable runtime. The HUD uses anonymous compiler paths.

The public-ready repository starts from a clean snapshot using a team author and a GitHub noreply address. Previous development history and previous release files are retained in a separate private backup.

Share the complete release download, not an entire development workspace. Ignored local files and private backups can still exist on a developer computer. Automated scans reduce accidental exposure; they cannot prove that arbitrary third-party files contain no sensitive data.
