# Alibaba Cloud Workbench connection

This workspace can manage the Alibaba Cloud ECS instance through the locally
installed Workbench CLI. Use this instead of SSH unless the user explicitly
requests an SSH workflow.

## Verified target

| Field | Value |
| --- | --- |
| Region | `cn-beijing` |
| Instance ID | `i-2ze94lfaf2170ie53xod` |
| OS | Ubuntu 22.04 |
| State at setup | Running |

## Command path

Always invoke the executable by its absolute path. Some long-running Codex
processes do not inherit the user PATH that was updated during installation.

```powershell
& 'C:\Program Files\workbench\workbench.exe' version
```

The authenticated profile is stored locally by Workbench. Do not inspect,
print, upload, commit, or edit its credential file, and never ask the user to
paste an AccessKey Secret into chat.

## Safe connectivity checks

```powershell
& 'C:\Program Files\workbench\workbench.exe' list ecs --region cn-beijing --output json
& 'C:\Program Files\workbench\workbench.exe' exec --instance-id i-2ze94lfaf2170ie53xod --command "uname -a" --output json
```

## Remote commands

Use `exec` for non-interactive commands. Each invocation has a separate shell,
so preserve any required state within the command itself.

```powershell
& 'C:\Program Files\workbench\workbench.exe' exec --instance-id i-2ze94lfaf2170ie53xod --command "df -h" --output json
```

Before any command that changes packages, services, firewall rules, files, or
deployment configuration, explain the operation and target to the user and get
their explicit approval. For an upload, first check whether the remote target
exists and warn the user before overwriting it.

