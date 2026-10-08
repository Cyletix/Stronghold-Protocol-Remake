# The job handle belongs only to this launcher. Windows closes it even when
# its console is forcibly closed, terminating this game's descendant processes.
function Start-OwnedGameProcess {
    param([Parameter(Mandatory=$true)][string]$Executable, [string[]]$Arguments, [string]$WorkingDirectory, [string]$BrowserTicket = '')
    if (-not ('ArkGame.ProcessJob' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.ComponentModel;
using System.IO;
using System.Diagnostics;
namespace ArkGame {
 public static class ProcessJob {
  [StructLayout(LayoutKind.Sequential)] struct BasicLimits { public long PerProcessTime,PerJobTime; public uint Flags; public UIntPtr MinWorkingSet,MaxWorkingSet; public uint ActiveProcessLimit; public UIntPtr Affinity; public uint PriorityClass,SchedulingClass; }
  [StructLayout(LayoutKind.Sequential)] struct IoCounters { public ulong ReadOperation,WriteOperation,OtherOperation,ReadTransfer,WriteTransfer,OtherTransfer; }
  [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits { public BasicLimits Basic; public IoCounters Io; public UIntPtr ProcessMemory,JobMemory,PeakProcessMemory,PeakJobMemory; }
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct Startup { public uint cb; public string reserved,desktop,title; public uint x,y,xSize,ySize,xChars,yChars,fill,flags; public ushort show,reserved2; public IntPtr reservedPtr,input,output,error; }
  [StructLayout(LayoutKind.Sequential)] struct ProcessInfo { public IntPtr process,thread; public uint processId,threadId; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr job,int type,ref ExtendedLimits value,uint length);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcess(string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref Startup startup,out ProcessInfo info);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr process,out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll")] static extern IntPtr GetStdHandle(int which);
  static string Quote(string arg) {
   var result=new StringBuilder("\""); int slashes=0;
   foreach(char c in arg) { if(c=='\\'){slashes++;continue;} if(c=='\"'){result.Append('\\',slashes*2+1);result.Append(c);}else{result.Append('\\',slashes);result.Append(c);} slashes=0; }
   result.Append('\\',slashes*2);result.Append('"');return result.ToString();
  }
  public static int Run(string executable,string[] args,string directory,string browserTicket) {
   IntPtr job=CreateJobObject(IntPtr.Zero,null); if(job==IntPtr.Zero)throw new Win32Exception();
   ProcessInfo info=new ProcessInfo();
   try {
    var limits=new ExtendedLimits();limits.Basic.Flags=0x2000; // KILL_ON_JOB_CLOSE
    if(!SetInformationJobObject(job,9,ref limits,(uint)Marshal.SizeOf(limits)))throw new Win32Exception();
    var cmd=new StringBuilder(Quote(executable));foreach(string arg in args)cmd.Append(' ').Append(Quote(arg));
    var start=new Startup();start.cb=(uint)Marshal.SizeOf(start);start.flags=0x100;start.input=GetStdHandle(-10);start.output=GetStdHandle(-11);start.error=GetStdHandle(-12);
    // Suspend before assignment: no child can escape before the job owns Node.
    if(!CreateProcess(executable,cmd,IntPtr.Zero,IntPtr.Zero,true,4,IntPtr.Zero,directory,ref start,out info))throw new Win32Exception();
    if(!AssignProcessToJobObject(job,info.process)){int error=Marshal.GetLastWin32Error();TerminateProcess(info.process,1);throw new Win32Exception(error);}
    if(ResumeThread(info.thread)==0xffffffff)throw new Win32Exception();
    bool opened=false;
    while(WaitForSingleObject(info.process,100)==258) {
     if(!opened&&!String.IsNullOrEmpty(browserTicket)&&File.Exists(browserTicket)) {
      string target=File.ReadAllText(browserTicket).Trim();Uri uri;
      if(!Uri.TryCreate(target,UriKind.Absolute,out uri)||uri.Scheme!="http"||uri.Host!="127.0.0.1"||uri.Port<1||uri.UserInfo!="")throw new InvalidOperationException("Invalid game page address.");
      // This code runs in the outer launcher, outside the child's job. Opening
      // a browser here prevents game cleanup from killing unrelated browser tabs.
      Process.Start(new ProcessStartInfo(target){UseShellExecute=true});opened=true;File.Delete(browserTicket);
     }
    }
    uint code;GetExitCodeProcess(info.process,out code);return unchecked((int)code);
   } finally { CloseHandle(job);if(info.thread!=IntPtr.Zero)CloseHandle(info.thread);if(info.process!=IntPtr.Zero)CloseHandle(info.process);if(!String.IsNullOrEmpty(browserTicket)){if(File.Exists(browserTicket))File.Delete(browserTicket);if(File.Exists(browserTicket+".tmp"))File.Delete(browserTicket+".tmp");} }
  }
 }
}
'@
    }
    [ArkGame.ProcessJob]::Run($Executable,$Arguments,$WorkingDirectory,$BrowserTicket)
}
Export-ModuleMember -Function Start-OwnedGameProcess
