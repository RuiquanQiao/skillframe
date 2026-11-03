// The .exe files in demos/: each one only runs `node scripts/window.mjs <app> [folder]`
// without a console window, and shows what went wrong if that fails. All the logic is in window.mjs.
// App.Id and App.Title come from a small file scripts/build-exe.mjs writes for each .exe.
// Build: npm run exe
using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Windows.Forms;

static class Launcher
{
    [STAThread]
    static int Main(string[] args)
    {
        bool zh = CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "zh";
        string root = FindRepository(AppDomain.CurrentDomain.BaseDirectory);
        string script = root == null ? null : Path.Combine(root, "scripts", "window.mjs");
        if (script == null)
            return Fail(zh
                ? "找不到 scripts\\window.mjs。\n\n" + App.Title + ".exe 要留在 skillframe 仓库文件夹里；想放到别处，请建快捷方式。"
                : "scripts\\window.mjs was not found.\n\n" + App.Title + ".exe has to stay in the skillframe repository folder; to start it from elsewhere, make a shortcut.");

        string node = FindOnPath("node.exe");
        if (node == null)
            return Fail(zh
                ? "需要 Node.js 22 或更新版本。\n\n请从 https://nodejs.org 安装，然后再打开 " + App.Title + "。"
                : "Node.js 22 or newer is needed.\n\nInstall it from https://nodejs.org, then open " + App.Title + " again.");

        // a folder dropped on the .exe goes along (Studio opens it)
        string extra = args.Length > 0 ? " \"" + args[0].TrimEnd('\\') + "\"" : "";
        var info = new ProcessStartInfo(node, "\"" + script + "\" " + App.Id + extra)
        {
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardError = true,
        };
        try
        {
            using (Process p = Process.Start(info))
            {
                // window.mjs runs until the window closes; on failure it says why on stderr
                string error = p.StandardError.ReadToEnd();
                p.WaitForExit();
                if (p.ExitCode != 0)
                    return Fail(error.Trim().Length > 0 ? error.Trim() : (zh ? "启动失败，退出码 " : "Failed to start, exit code ") + p.ExitCode);
            }
        }
        catch (Exception e)
        {
            return Fail((zh ? "无法启动 Node.js：" : "Couldn't start Node.js: ") + e.Message + "\n\n" + node);
        }
        return 0;
    }

    // the repository is the first folder up from the .exe that has scripts\window.mjs
    static string FindRepository(string dir)
    {
        for (var d = new DirectoryInfo(dir); d != null; d = d.Parent)
            if (File.Exists(Path.Combine(d.FullName, "scripts", "window.mjs"))) return d.FullName;
        return null;
    }

    static string FindOnPath(string exe)
    {
        foreach (string dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator))
        {
            try
            {
                string candidate = Path.Combine(dir.Trim().Trim('"'), exe);
                if (File.Exists(candidate)) return candidate;
            }
            catch (ArgumentException) { }
        }
        return null;
    }

    static int Fail(string message)
    {
        MessageBox.Show(message, App.Title, MessageBoxButtons.OK, MessageBoxIcon.Warning);
        return 1;
    }
}
