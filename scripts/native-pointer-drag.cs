using System;
using System.Runtime.InteropServices;
using System.Threading;

internal static class NativePointerDrag
{
    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern void mouse_event(uint flags, uint x, uint y, uint data, UIntPtr extraInfo);

    private const uint LeftDown = 0x0002;
    private const uint LeftUp = 0x0004;

    private static int Main(string[] args)
    {
        int x, y, dx, dy;
        if (args.Length != 4
            || !int.TryParse(args[0], out x)
            || !int.TryParse(args[1], out y)
            || !int.TryParse(args[2], out dx)
            || !int.TryParse(args[3], out dy)) return 2;

        if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware();
        SetCursorPos(x, y);
        Thread.Sleep(180);
        mouse_event(LeftDown, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(180);
        for (var step = 1; step <= 6; step += 1)
        {
            SetCursorPos(x + dx * step / 6, y + dy * step / 6);
            Thread.Sleep(140);
        }
        mouse_event(LeftUp, 0, 0, 0, UIntPtr.Zero);
        Thread.Sleep(180);
        Console.WriteLine("Native pointer drag completed.");
        return 0;
    }
}
