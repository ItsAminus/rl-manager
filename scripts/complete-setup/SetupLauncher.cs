using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;
internal static class SetupLauncher {
  [STAThread] static void Main() {
    try {
      string script=Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"Setup","Install-RLM.ps1");
      if(!File.Exists(script)||!File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"manifest.json")))throw new IOException("Extract the entire RLM download folder before running setup.");
      var info=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File \""+script+"\"");
      info.UseShellExecute=false;info.CreateNoWindow=true;
      using(var process=Process.Start(info)){
        process.WaitForExit();
        if(process.ExitCode!=0)throw new IOException("Setup could not start correctly. Extract the complete download again and check Read me.txt for the installation steps.");
      }
    }catch(Exception error){MessageBox.Show(error.Message,"RL Manager setup",MessageBoxButtons.OK,MessageBoxIcon.Warning);}
  }
}
