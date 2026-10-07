// An isolated launch probe, never the real application. It writes only beside
// its own executable so the native updater's original-user handoff can be tested.
using System;
using System.IO;
using System.Reflection;

internal static class UpdateLaunchProbe
{
    private static void Main(string[] args)
    {
        string directory = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        File.AppendAllText(Path.Combine(directory, "launch-marker.txt"),
            string.Join(" ", args) + "\n" + Environment.CurrentDirectory + "\n");
    }
}
