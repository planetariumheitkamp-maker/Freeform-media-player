import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PART_SIZE = 16 * 1024 * 1024;
const FORMAT = 'freeform-email-multipart-v1';
const SCRIPT_NAME = 'make-email-packages.mjs';

function usage() {
  console.error(`Usage: node scripts/${SCRIPT_NAME} <installer.exe> <archive.zip> <output-directory>`);
  process.exitCode = 1;
}

async function assertFile(filePath) {
  const details = await stat(filePath);
  if (!details.isFile() || details.size === 0) {
    throw new Error(`Expected a non-empty file: ${filePath}`);
  }
  return details.size;
}

async function splitFile(sourcePath, targetDirectory, fileName, expectedSize) {
  const input = await open(sourcePath, 'r');
  const wholeFileHash = createHash('sha256');
  const parts = [];

  try {
    let offset = 0;
    let index = 1;
    while (offset < expectedSize) {
      const length = Math.min(PART_SIZE, expectedSize - offset);
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await input.read(buffer, 0, length, offset);
      if (bytesRead !== length) {
        throw new Error(`Could not read ${fileName} completely at byte ${offset}.`);
      }

      wholeFileHash.update(buffer);
      const partName = `${fileName}.part${String(index).padStart(3, '0')}`;
      await writeFile(path.join(targetDirectory, partName), buffer, { flag: 'wx' });
      parts.push({
        name: partName,
        size: length,
        sha256: createHash('sha256').update(buffer).digest('hex'),
      });
      offset += length;
      index += 1;
    }
  } finally {
    await input.close();
  }

  return {
    fileName,
    size: expectedSize,
    sha256: wholeFileHash.digest('hex'),
    parts,
  };
}

const powershellScript = String.raw`$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

try {
    $manifestPath = Join-Path $PSScriptRoot 'email-manifest.json'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw 'email-manifest.json is missing. Download all helper files into this folder.'
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ([string]$manifest.format -ne 'freeform-email-multipart-v1') {
        throw 'This manifest is not a supported Freeform email package.'
    }

    $expectedParts = @($manifest.parts)
    if ($expectedParts.Count -ne [int]$manifest.partCount) {
        throw 'The manifest part count is inconsistent.'
    }

    $partFiles = @(Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object {
        $_.Name -match '\.part[0-9]{3}$'
    })
    if ($partFiles.Count -ne $expectedParts.Count) {
        throw "Expected $($expectedParts.Count) numbered parts, but found $($partFiles.Count). Download every part and keep the original filenames."
    }

    $expectedNames = @($expectedParts | ForEach-Object { [string]$_.name } | Sort-Object)
    $actualNames = @($partFiles.Name | Sort-Object)
    if (Compare-Object -ReferenceObject $expectedNames -DifferenceObject $actualNames) {
        throw 'The numbered part filenames do not match the manifest. Remove duplicate downloads and restore the original names.'
    }

    Write-Host 'Checking downloaded parts...'
    foreach ($part in $expectedParts) {
        $partPath = Join-Path $PSScriptRoot ([string]$part.name)
        $partItem = Get-Item -LiteralPath $partPath
        if ($partItem.Length -ne [int64]$part.size) {
            throw "$($part.name) has the wrong size. Download it again."
        }
        $partHash = (Get-FileHash -LiteralPath $partPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($partHash -ne ([string]$part.sha256).ToLowerInvariant()) {
            throw "$($part.name) failed its checksum. Download it again."
        }
    }

    $outputPath = Join-Path $PSScriptRoot ([string]$manifest.fileName)
    if (Test-Path -LiteralPath $outputPath) {
        $existingItem = Get-Item -LiteralPath $outputPath
        $existingHash = (Get-FileHash -LiteralPath $outputPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($existingItem.Length -eq [int64]$manifest.size -and
            $existingHash -eq ([string]$manifest.sha256).ToLowerInvariant()) {
            Write-Host "The verified file already exists: $outputPath" -ForegroundColor Green
            exit 0
        }
        throw "$($manifest.fileName) already exists and does not match this package. Move it elsewhere before reassembling."
    }

    $temporaryPath = Join-Path $PSScriptRoot ".freeform-reassembly-$PID.tmp"
    $outputStream = $null
    try {
        Write-Host 'Reassembling the original file...'
        $outputStream = [System.IO.File]::Open(
            $temporaryPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
        foreach ($part in $expectedParts) {
            $inputStream = [System.IO.File]::OpenRead((Join-Path $PSScriptRoot ([string]$part.name)))
            try {
                $inputStream.CopyTo($outputStream)
            }
            finally {
                $inputStream.Dispose()
            }
        }
    }
    finally {
        if ($null -ne $outputStream) {
            $outputStream.Dispose()
        }
    }

    try {
        $outputItem = Get-Item -LiteralPath $temporaryPath
        $outputHash = (Get-FileHash -LiteralPath $temporaryPath -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($outputItem.Length -ne [int64]$manifest.size -or
            $outputHash -ne ([string]$manifest.sha256).ToLowerInvariant()) {
            throw 'The reconstructed file failed its final size or SHA-256 check.'
        }
        Move-Item -LiteralPath $temporaryPath -Destination $outputPath -ErrorAction Stop
    }
    catch {
        Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
        throw
    }

    Write-Host ''
    Write-Host "Success: $outputPath" -ForegroundColor Green
    Write-Host "SHA-256: $($manifest.sha256)"
}
catch {
    Write-Host ''
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
`;

const commandLauncher = `@echo off\r\nsetlocal\r\npowershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Reassemble.ps1"\r\nif errorlevel 1 (\r\n  echo.\r\n  echo Reassembly failed. Review the message above, then try again.\r\n  pause\r\n  exit /b 1\r\n)\r\necho.\r\npause\r\n`;

function recipientInstructions(label, manifest) {
  const isInstaller = label === 'INSTALLER';
  const useInstructions = isInstaller
    ? 'Run the reconstructed installer to install Freeform. It is unsigned, so Windows SmartScreen may request confirmation.'
    : 'Right-click the reconstructed ZIP, choose Extract All, then open Freeform.exe from the extracted folder.';

  return `FREEFORM EMAIL PACKAGE — ${label}

Original file: ${manifest.fileName}
Original size: ${manifest.size} bytes
Original SHA-256: ${manifest.sha256}
Numbered parts: ${manifest.partCount}
Maximum part size: ${PART_SIZE} bytes (16 MiB)

SENDING BY EMAIL

1. Send exactly one numbered .part### file per email, in order from part001 through part${String(manifest.partCount).padStart(3, '0')}.
2. Send README-EMAIL.txt, Reassemble.cmd, Reassemble.ps1, and email-manifest.json to the recipient as well. These are small helper files; they can go together in one separate email.
3. Tell the recipient to expect ${manifest.partCount} parts and to keep every original filename unchanged.
4. The 16 MiB parts normally become about 22.4 MB after email base64 encoding. This leaves some room below a 25 MB message limit, but providers set their own limits.

RECEIVING AND REASSEMBLING ON WINDOWS

1. Create an empty folder. Download all ${manifest.partCount} numbered parts and all four helper files into that same folder.
2. Check that no browser-added suffixes such as " (1)" remain in the filenames.
3. Double-click Reassemble.cmd. It uses Windows PowerShell, checks every part's size and SHA-256, joins the parts in order, and verifies the completed file.
4. Do not interrupt the process. A successful run creates ${manifest.fileName} in the same folder. A failed final check removes the incomplete output.
5. ${useInstructions}

IMPORTANT

Email providers may still block executable content or archives containing executables, including multipart attachments. Splitting a file does not make it safe or guarantee delivery; do not use it to bypass security scanning. Share only software that the recipient expects and trusts. If a provider blocks these attachments, use an approved file-sharing service instead.

email-manifest.json is the machine-readable source for the expected filename, sizes, part order, and SHA-256 hashes. Keep it with the numbered parts.
`;
}

async function prepareTargetDirectory(outputRoot, folderName, stagingName) {
  const target = path.join(outputRoot, folderName);
  const staging = path.join(outputRoot, stagingName);
  await rm(staging, { recursive: true, force: true });

  await mkdir(outputRoot, { recursive: true });
  let targetExists = true;
  try {
    const targetDetails = await stat(target);
    if (!targetDetails.isDirectory()) {
      throw new Error(`Cannot replace ${target}: it is not a directory.`);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    targetExists = false;
  }

  if (targetExists) {
    let existingManifest;
    try {
      existingManifest = JSON.parse(await readFile(path.join(target, 'email-manifest.json'), 'utf8'));
    } catch {
      throw new Error(`Cannot replace ${target}: its existing manifest is missing or invalid. Move it aside first.`);
    }
    if (existingManifest.format !== FORMAT) {
      throw new Error(`Cannot replace ${target}: it is not a generated email package. Move it aside first.`);
    }
  }

  await mkdir(staging, { recursive: true });
  return { target, staging };
}

async function generatePackage(kind, label, sourcePath, outputRoot) {
  const source = path.resolve(sourcePath);
  const size = await assertFile(source);
  const fileName = path.basename(source);
  const { target, staging } = await prepareTargetDirectory(outputRoot, kind, `.${kind}-email-tmp`);
  const backup = path.join(outputRoot, `.${kind}-email-backup`);

  try {
    const split = await splitFile(source, staging, fileName, size);
    const manifest = {
      format: FORMAT,
      kind,
      fileName: split.fileName,
      size: split.size,
      sha256: split.sha256,
      partSize: PART_SIZE,
      partCount: split.parts.length,
      parts: split.parts,
    };

    await writeFile(path.join(staging, 'email-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(path.join(staging, 'Reassemble.ps1'), powershellScript.replaceAll('\n', '\r\n'));
    await writeFile(path.join(staging, 'Reassemble.cmd'), commandLauncher);
    await writeFile(path.join(staging, 'README-EMAIL.txt'), recipientInstructions(label, manifest).replaceAll('\n', '\r\n'));

    await rm(backup, { recursive: true, force: true });
    try {
      await rename(target, backup);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    await rename(staging, target);
    await rm(backup, { recursive: true, force: true });
    return manifest;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    usage();
    return;
  }

  const [installerPath, archivePath, outputPath] = args;
  const outputRoot = path.resolve(outputPath);
  const installer = await generatePackage('installer', 'INSTALLER', installerPath, outputRoot);
  console.log(`Installer: ${installer.partCount} parts, SHA-256 ${installer.sha256}`);
  const archive = await generatePackage('zip', 'ZIP', archivePath, outputRoot);
  console.log(`ZIP: ${archive.partCount} parts, SHA-256 ${archive.sha256}`);

  const overview = `Freeform email packages\n\nInstaller: installer/ (${installer.partCount} parts)\nPortable ZIP: zip/ (${archive.partCount} parts)\n\nOpen README-EMAIL.txt inside either folder for sending and Windows reassembly instructions.\nSend one numbered part per email. Recipients must download every part and the helper files, then run Reassemble.cmd.\n\nEmail providers may still block executable or archived-executable content. Delivery is not guaranteed.\n`;
  await writeFile(path.join(outputRoot, 'README-EMAIL.txt'), overview.replaceAll('\n', '\r\n'));
  console.log(`Email packages written to ${outputRoot}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
