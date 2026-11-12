using System;
using System.Globalization;
using System.Runtime.InteropServices;

internal static class NativeWindowStyle
{
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong(IntPtr window, int index);

    private static int Main(string[] args)
    {
        long handle;
        if (args.Length != 1 || !long.TryParse(args[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out handle)) return 2;
        var style = unchecked((uint)GetWindowLong(new IntPtr(handle), -16));
        Console.WriteLine(string.Format(CultureInfo.InvariantCulture,
            "{{\"caption\":{0},\"thickFrame\":{1},\"minimizeBox\":{2},\"maximizeBox\":{3},\"systemMenu\":{4}}}",
            JsonBoolean((style & 0x00C00000) == 0x00C00000),
            JsonBoolean((style & 0x00040000) != 0),
            JsonBoolean((style & 0x00020000) != 0),
            JsonBoolean((style & 0x00010000) != 0),
            JsonBoolean((style & 0x00080000) != 0)));
        return 0;
    }

    private static string JsonBoolean(bool value)
    {
        return value ? "true" : "false";
    }
}
