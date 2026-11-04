// demos\skillframe-window.exe: a native window (WebView2, the engine Windows ships) that shows one
// page, the way Resume Studio's window does. scripts/window.mjs opens it instead of an Edge window:
// no browser chrome, its own taskbar button and icon, the page's title as the window's.
//
//   skillframe-window.exe --url http://127.0.0.1:1234/ --title "skillframe" --data <folder> [--icon file.ico]
//
// The title bar: a page that has <skillframe-titlebar> draws its own (the app's logo and name, its
// settings, minimize / maximize / close), and the window drops the one Windows draws. The page's
// bar is a real title bar: dragging it moves the window (and snaps it to an edge), a double click
// maximizes, a right click opens the window menu. A page without it keeps Windows' bar. The window
// remembers which the page had (in --data), so it opens the right way the next time, no flicker.
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

/** A form that can give its title bar to the page: the client area then reaches the window's top. */
class HostForm : Form
{
    [StructLayout(LayoutKind.Sequential)]
    struct RECT { public int left, top, right, bottom; }

    [DllImport("user32.dll")]
    static extern bool IsZoomed(IntPtr hwnd);

    [DllImport("user32.dll")]
    static extern bool SetWindowPos(IntPtr hwnd, IntPtr after, int x, int y, int cx, int cy, uint flags);

    bool custom;

    /** true: the page draws the title bar */
    public bool Custom
    {
        get { return custom; }
        set
        {
            if (custom == value) return;
            custom = value;
            // SWP_FRAMECHANGED: Windows asks WM_NCCALCSIZE again (NOMOVE | NOSIZE | NOZORDER | NOACTIVATE)
            if (IsHandleCreated) SetWindowPos(Handle, IntPtr.Zero, 0, 0, 0, 0, 0x0020 | 0x0002 | 0x0001 | 0x0004 | 0x0010);
        }
    }

    protected override void WndProc(ref Message m)
    {
        // WM_NCCALCSIZE with wParam: where the client area goes. Windows' answer has the caption and
        // the borders taken off; this keeps the side and bottom borders (invisible on Windows 10 and
        // 11, but they still resize the window and snap it) and gives the caption to the page.
        // Maximized, Windows puts the frame past the screen's edge: the top keeps that much off.
        if (m.Msg == 0x0083 && custom && m.WParam != IntPtr.Zero)
        {
            var before = (RECT)Marshal.PtrToStructure(m.LParam, typeof(RECT));
            base.WndProc(ref m);
            var after = (RECT)Marshal.PtrToStructure(m.LParam, typeof(RECT));
            after.top = before.top + (IsZoomed(Handle) ? after.left - before.left : 0);
            Marshal.StructureToPtr(after, m.LParam, false);
            m.Result = IntPtr.Zero;
            return;
        }
        base.WndProc(ref m);
    }
}

static class HostWindow
{
    [DllImport("dwmapi.dll")]
    static extern int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);

    [DllImport("user32.dll")]
    static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [DllImport("user32.dll")]
    static extern bool ReleaseCapture();

    [DllImport("user32.dll")]
    static extern IntPtr SendMessage(IntPtr hwnd, int msg, IntPtr wParam, IntPtr lParam);

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
        var form = new HostForm { Text = title, StartPosition = FormStartPosition.CenterScreen, BackColor = Dark() ? Color.FromArgb(24, 26, 29) : Color.White };
        Rectangle area = Screen.PrimaryScreen.WorkingArea;
        form.Size = new Size(Math.Min(1440, area.Width * 9 / 10), Math.Min(900, area.Height * 9 / 10));
        form.MinimumSize = new Size(640, 420);
        if (iconFile != null && File.Exists(iconFile)) form.Icon = new Icon(iconFile);

        // the page had its own title bar last time: open without Windows' one
        string remember = data == null ? null : Path.Combine(data, "titlebar");
        form.Custom = remember != null && File.Exists(remember);
        form.HandleCreated += (s, e) =>
        {
            // Windows' title bar (when the page has none) follows the system's light or dark setting
            int on = Dark() ? 1 : 0;
            DwmSetWindowAttribute(form.Handle, 20, ref on, 4);
        };

        var view = new WebView2 { Dock = DockStyle.Fill, DefaultBackgroundColor = form.BackColor };
        if (data != null) view.CreationProperties = new CoreWebView2CreationProperties { UserDataFolder = data };
        bool pageBar = false; // the page in the window now said it draws the title bar

        // the window's state, for the page's maximize / restore button and its dimmed look when inactive
        Action tell = () =>
        {
            if (view.CoreWebView2 == null || !form.Custom) return;
            bool max = form.WindowState == FormWindowState.Maximized;
            try { view.CoreWebView2.PostWebMessageAsJson("{\"sf\":\"window\",\"custom\":true,\"maximized\":" + (max ? "true" : "false") + ",\"active\":" + (Form.ActiveForm == form ? "true" : "false") + "}"); }
            catch (Exception) { }
        };
        form.Resize += (s, e) => tell();
        form.Activated += (s, e) => tell();
        form.Deactivate += (s, e) => tell();

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
            // the page's `app-region: drag` areas act as the title bar (move, snap, double click, window menu)
            core.Settings.IsNonClientRegionSupportEnabled = true;
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
            core.NavigationStarting += (s2, e2) => { pageBar = false; };
            // a page that never says it has a title bar (another page, or an error page) gets Windows' one back,
            // so the window can always be moved and closed
            core.NavigationCompleted += (s2, e2) =>
            {
                var timer = new Timer { Interval = 2500 };
                timer.Tick += (s3, e3) =>
                {
                    timer.Dispose();
                    if (pageBar) return;
                    form.Custom = false;
                    if (remember != null) try { File.Delete(remember); } catch (Exception) { }
                };
                timer.Start();
            };
            core.WebMessageReceived += (s2, e2) =>
            {
                string what;
                try { what = e2.TryGetWebMessageAsString(); } catch (Exception) { return; } // only plain strings
                switch (what)
                {
                    case "sf:titlebar":
                        pageBar = true;
                        form.Custom = true;
                        if (remember != null) try { File.WriteAllText(remember, "page"); } catch (Exception) { }
                        tell();
                        break;
                    case "sf:minimize":
                        form.WindowState = FormWindowState.Minimized;
                        break;
                    case "sf:maximize":
                        form.WindowState = form.WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
                        break;
                    case "sf:close":
                        form.Close();
                        break;
                    case "sf:resize-top":
                    case "sf:resize-topleft":
                    case "sf:resize-topright":
                        // the page's top edge: Windows resizes from there (HTTOP 12, HTTOPLEFT 13, HTTOPRIGHT 14)
                        if (Control.MouseButtons != MouseButtons.Left || form.WindowState != FormWindowState.Normal) break;
                        int hit = what == "sf:resize-top" ? 12 : what == "sf:resize-topleft" ? 13 : 14;
                        ReleaseCapture();
                        SendMessage(form.Handle, 0x00A1, new IntPtr(hit), IntPtr.Zero); // WM_NCLBUTTONDOWN
                        break;
                }
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
