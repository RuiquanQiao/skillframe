// demos\skillframe-window.exe: a native window (WebView2, the engine Windows ships) that shows one
// page, the way Resume Studio's window does. scripts/window.mjs opens it instead of an Edge window:
// no browser chrome, its own taskbar button and icon, the page's title as the window's.
//
//   skillframe-window.exe --url http://127.0.0.1:1234/ --title "skillframe" --data <folder> [--icon file.ico]
//
// Links that open a new window go to the user's own browser. The window's data (storage, cache)
// stays in --data. Built by scripts/build-exe.mjs with the C# compiler that comes with Windows,
// against the WebView2 SDK it downloads into .cache/nuget.
using System;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class HostWindow
{
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    [DllImport("user32.dll")]
    static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [StructLayout(LayoutKind.Sequential)]
    struct FLASHWINFO { public uint cbSize; public IntPtr hwnd; public uint dwFlags; public uint uCount; public uint dwTimeout; }

    [DllImport("user32.dll")]
    static extern bool FlashWindowEx(ref FLASHWINFO info);

    /** the taskbar button blinks until the window is brought forward */
    static void Flash(IntPtr hwnd)
    {
        var info = new FLASHWINFO { hwnd = hwnd, dwFlags = 3 | 12, uCount = uint.MaxValue }; // FLASHW_ALL | FLASHW_TIMERNOFG
        info.cbSize = (uint)Marshal.SizeOf(info);
        FlashWindowEx(ref info);
    }

    [STAThread]
    static int Main(string[] args)
    {
        string url = Arg(args, "--url"), title = Arg(args, "--title") ?? "skillframe", data = Arg(args, "--data"), iconFile = Arg(args, "--icon");
        bool zh = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh";
        if (url == null)
        {
            MessageBox.Show("--url is missing", title);
            return 2;
        }
        try
        {
            CoreWebView2Environment.GetAvailableBrowserVersionString();
        }
        catch (Exception)
        {
            MessageBox.Show(zh
                ? "这台电脑没有 Microsoft Edge WebView2 运行时。\n\n请从 https://go.microsoft.com/fwlink/p/?LinkId=2124703 安装后再打开。"
                : "The Microsoft Edge WebView2 Runtime is not installed.\n\nInstall it from https://go.microsoft.com/fwlink/p/?LinkId=2124703, then open this again.", title);
            return 3;
        }

        // per-monitor DPI, so text is sharp on a scaled display (-4: PER_MONITOR_AWARE_V2)
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch (Exception) { }
        Application.EnableVisualStyles();
        var form = new Form { Text = title, StartPosition = FormStartPosition.CenterScreen, BackColor = Dark() ? Color.FromArgb(24, 26, 29) : Color.White };
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        form.Size = new Size(Math.Min(1440, area.Width * 9 / 10), Math.Min(900, area.Height * 9 / 10));
        form.MinimumSize = new Size(640, 420);
        if (iconFile != null && File.Exists(iconFile)) form.Icon = new Icon(iconFile);
        form.HandleCreated += (s, e) =>
        {
            // the title bar follows the system's light or dark setting
            int on = Dark() ? 1 : 0;
            DwmSetWindowAttribute(form.Handle, 20, ref on, 4);
        };

        var view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = form.BackColor };
        if (data != null) view.CreationProperties = new CoreWebView2CreationProperties { UserDataFolder = data };
        view.CoreWebView2InitializationCompleted += (s, e) =>
        {
            if (!e.IsSuccess)
            {
                MessageBox.Show(e.InitializationException.Message, title);
                form.Close();
                return;
            }
            var core = view.CoreWebView2;
            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDevToolsEnabled = true; // F12, for the developer building the app
            core.DocumentTitleChanged += (s2, e2) =>
            {
                string t = core.DocumentTitle;
                if (string.IsNullOrWhiteSpace(t)) return;
                form.Text = t;
                // the sidebar marks the title when a reply ends or the agent waits, while the user is elsewhere
                if (t.StartsWith("● ") && !form.ContainsFocus) Flash(form.Handle);
            };
            core.NewWindowRequested += (s2, e2) =>
            {
                e2.Handled = true;
                try { Process.Start(new ProcessStartInfo(e2.Uri) { UseShellExecute = true }); } catch (Exception) { }
            };
        };
        form.Controls.Add(view);
        view.Source = new Uri(url);
        Application.Run(form);
        return 0;
    }

    static string Arg(string[] args, string name)
    {
        for (int i = 0; i < args.Length - 1; i++) if (args[i] == name) return args[i + 1];
        return null;
    }

    static bool Dark()
    {
        try
        {
            object v = Microsoft.Win32.Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme", 1);
            return v is int && (int)v == 0;
        }
        catch (Exception) { return false; }
    }
}
