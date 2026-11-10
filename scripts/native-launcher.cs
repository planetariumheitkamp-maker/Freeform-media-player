using System;
using System.Diagnostics;
using System.IO;

internal static class NativeLauncher
{
    private static int Main(string[] args)
    {
        if (args.Length != 1) return 2;
        var appPath = Path.GetFullPath(args[0]);
        var root = Path.GetFullPath(Path.Combine(appPath, "..", ".."));
        var startInfo = new ProcessStartInfo
        {
            FileName = Path.Combine(root, "node_modules", "electron", "dist", "electron.exe"),
            Arguments = "\"" + appPath + "\"",
            WorkingDirectory = root,
            UseShellExecute = false,
        };
        startInfo.Environment.Remove("ELECTRON_RUN_AS_NODE");
        startInfo.Environment.Remove("ELECTRON_RENDERER_URL");
        using (var process = Process.Start(startInfo))
        {
            process.WaitForExit();
            return process.ExitCode;
        }
    }
}
