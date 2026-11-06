"""Narrow privileged bpftrace launcher/identity reader/pidfd stopper.

Never execute a shell, signal a numeric PID, change sysctls/capabilities, profile
the caller, or attach a probe other than the reviewed generated program. The
controller passes an operational-only environment; exec replaces it again.
"""
import hashlib
import json
import os
import pathlib
import re
try:
    import resource
except ImportError:
    resource=None  # Importable for pure guard tests on Windows; CLI stays Linux-only.
import signal
import stat
import sys

def require(condition, message):
    if not condition:
        raise RuntimeError(message)

def identity(pid):
    text=pathlib.Path(f'/proc/{pid}/stat').read_text()
    end=text.rfind(')')
    require(end>0, 'Malformed process identity')
    fields=text[end+2:].split()
    return {'pid':int(text[:text.index('(')].strip()),'startTicks':fields[19],
            'state':fields[0],'parentPid':int(fields[1]),'userTicks':fields[11],'systemTicks':fields[12]}

def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''):
            h.update(block)
    return h.hexdigest()

def exact_identity(actual,expected):
    require(actual['pid']==expected['pid'] and actual['startTicks']==expected['startTicks'],'Refuse reused process identity')

def confined(root,value,existing=True):
    path=pathlib.Path(value)
    require(path.is_absolute() and path.parent.resolve().is_relative_to(root),'Path escapes private profile root')
    require(not path.is_symlink(),'Refuse symlink')
    if existing:
        require(path.is_file(),'Missing regular profile file')
        require(stat.S_ISREG(path.stat().st_mode),'Refuse non-regular file')
    return path

def checked_environment(actual,expected):
    require(set(actual)==set(expected),'Unexpected child environment keys')
    for key in expected:
        require(actual[key]==expected[key],'Unexpected operational environment value: '+key)

def operational_environment(root):
    root=str(root);home=root+'/home'
    return {'PATH':'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','HOME':home,'TMPDIR':root+'/temp','XDG_CONFIG_HOME':home+'/config','XDG_CACHE_HOME':home+'/cache','LANG':'C.UTF-8','LC_ALL':'C.UTF-8','TZ':'UTC','SOGRIM_DISABLE_PRIVATE_ENV_AUTOLOAD':'1','ANDROID_HOME':'/usr/local/lib/android/sdk','ANDROID_SDK_ROOT':'/usr/local/lib/android/sdk','ANDROID_AVD_HOME':root+'/avds','ANDROID_USER_HOME':home,'ANDROID_EMULATOR_HOME':home,'ADB_VENDOR_KEYS':home+'/adbkey','ANDROID_ADB_SERVER_PORT':'5037','ADB_SERVER_SOCKET':'tcp:5037'}

def checked_profiler_environment(actual,root):
    expected={**operational_environment(root),'BPFTRACE_BTF':'/sys/kernel/btf/vmlinux','BPFTRACE_MAX_MAP_KEYS':'65536','BPFTRACE_LOG_SIZE':'1048576','BPFTRACE_STACK_MODE':'raw'}
    checked_environment(actual,expected)

def approved_program(target,clock_ticks):
    require(isinstance(target['pid'],int) and target['pid']>1,'Invalid target TGID')
    require(isinstance(target['startTicks'],str) and re.fullmatch(r'[1-9]\d*',target['startTicks']) is not None,'Invalid target birth')
    require(isinstance(clock_ticks,int) and clock_ticks>0 and 1000000000%clock_ticks==0,'Unsupported USER_HZ')
    pid=target['pid'];birth=target['startTicks'];divisor=1000000000//clock_ticks
    return (f'BEGIN {{ printf("SOGRIM_PROFILE_READY {pid} {birth}\\n"); }}\n'
            f'profile:hz:49 /pid == {pid}/ {{\n'
            '  $leader = ((struct task_struct *)curtask)->group_leader;\n'
            f'  if (($leader->start_boottime / {divisor}) == {birth}) {{\n'
            '    @samples[nsecs(monotonic) / 1000000000, tid, ustack(raw, 32)] = count();\n'
            '  }\n}\n'
            'interval:s:1200 { printf("SOGRIM_PROFILE_DEADLINE\\n"); exit(); }\n'
            'END { printf("SOGRIM_PROFILE_STOPPED\\n"); }\n')

def validate_program(config,clock_ticks):
    actual=pathlib.Path(config['program']).read_text()
    require(actual==approved_program(config['target'],clock_ticks),'Unapproved probe body; require TGID and birth before any stack/data read')
    require(digest(config['program'])==config['programSha256'],'Generated probe bytes changed')

def exec_profiler(config,execve=None,clock_ticks=None):
    # Independent privileged validation of the full body, not just a digest
    # supplied beside the program. Changing BOTH program and config hash fails.
    validate_program(config,os.sysconf('SC_CLK_TCK') if clock_ticks is None else clock_ticks)
    (os.execve if execve is None else execve)(config['tool'],config['command'],config['environment'])
    raise AssertionError('exec returned')

def read_environment(pid):
    entries=pathlib.Path(f'/proc/{pid}/environ').read_bytes().split(b'\0')
    result={}
    for entry in filter(None,entries):
        key,value=entry.split(b'=',1)
        key=key.decode()
        require(key not in result,'Duplicate environment key')
        result[key]=value.decode()
    return result

def check_target(config):
    target=config['target']
    before=identity(target['pid']);exact_identity(before,target)
    exe=os.readlink(f"/proc/{target['pid']}/exe")
    require(exe==target['exe'],'Foreign target executable')
    require(digest(exe)==target['exeSha256'],'Target executable bytes changed')
    command=[arg for arg in pathlib.Path(f"/proc/{target['pid']}/cmdline").read_bytes().decode().split('\0') if arg]
    require(command==target['command'],'Owned target command changed')
    require(pathlib.Path(f"/proc/{target['pid']}").stat().st_uid==config['runnerUid'],'Target belongs to another UID')
    checked_environment(read_environment(target['pid']),config['targetEnvironment'])
    exact_identity(identity(target['pid']),target)
    return before

def validate_config(config,path):
    require(sys.platform=='linux' and os.geteuid()==0,'Privileged helper requires the approved Linux runner')
    require(resource is not None,'Require kernel resource limits; no unbounded profiler fallback')
    require(hasattr(os,'pidfd_open') and hasattr(signal,'pidfd_send_signal'),'Require pidfd; no numeric-PID signal fallback')
    root=pathlib.Path(config['root'])
    require(re.fullmatch(r'/home/runner/work/_temp/android-host-profile-\d+-[a-f0-9]{32}',str(root)) is not None,'Unexpected private root')
    require(root.resolve()==root and not root.is_symlink(),'Redirected private root')
    info=root.stat();require(info.st_uid==config['runnerUid'] and stat.S_IMODE(info.st_mode)==0o700,'Private root ownership/mode mismatch')
    require(config['version']==1 and config['runnerUid']>0 and config['runnerGid']>=0,'Invalid launch configuration')
    require(re.fullmatch(r'[a-f0-9]{32}',config['nonce']) is not None and str(root).endswith('-'+config['nonce']),'Invalid profile nonce')
    confined(root,path)
    for key in ['program','output','ticket']:
        confined(root,config[key],existing=key!='ticket')
    require(config['tool']=='/usr/bin/bpftrace' and os.path.realpath(config['tool'])==config['tool'],'Only official bpftrace executable')
    info=os.stat(config['tool']);require(info.st_uid==0 and not info.st_mode&0o022,'Profiler binary is writable outside root')
    require(digest(config['tool'])==config['toolSha256'],'Profiler executable identity changed')
    require(digest(config['program'])==config['programSha256'],'Generated probe bytes changed')
    validate_program(config,os.sysconf('SC_CLK_TCK'))
    require(config['target']['kind'] in ['emulator','synthetic-preflight'],'Unexpected target kind')
    if config['target']['kind']=='synthetic-preflight':
        require(pathlib.Path(config['target']['exe'])==root/'scope-fixture','Foreign preflight executable')
    else:
        require(config['target']['exe']=='/usr/local/lib/android/sdk/emulator/qemu/linux-x86_64/qemu-system-x86_64-headless','Foreign emulator executable')
        command=config['target']['command'];run_id=str(root).split('android-host-profile-')[1].split('-')[0]
        required={'-avd':f'sogrim_ci_{run_id}_1_profile','-port':'5582','-gpu':'swiftshader','-feature':'GLDirectMem,HasSharedSlotsHostMemoryAllocator','-memory':'4096','-cores':'2'}
        require(command and command[0]==config['target']['exe'],'Foreign emulator argv0')
        for flag,value in required.items():
            require(command.count(flag)==1,'Missing/duplicate original emulator flag')
            index=command.index(flag);require(index+1<len(command) and command[index+1]==value,'Changed original emulator command')
    # The environment is reconstructed by the nonprivileged controller from
    # fixed values. Forbid credential/config injection even if config is corrupt.
    checked_profiler_environment(config['environment'],root)
    base_environment=operational_environment(root)
    target_environment=config['targetEnvironment'];extra=set(target_environment)-set(base_environment)
    require(extra <= {'LD_LIBRARY_PATH','ANDROID_EMULATOR_LAUNCHER_DIR'},'Unexpected target environment keys')
    checked_environment({key:target_environment.get(key) for key in base_environment},base_environment)
    emulator_root=pathlib.Path('/usr/local/lib/android/sdk/emulator').resolve()
    if extra:
        require(config['target']['kind']=='emulator','Synthetic fixture cannot add loader environment')
    for value in target_environment.get('LD_LIBRARY_PATH','').split(':') if 'LD_LIBRARY_PATH' in extra else []:
        require(value and pathlib.Path(value).is_absolute() and pathlib.Path(value).resolve().is_relative_to(emulator_root),'Foreign emulator library search path')
    if 'ANDROID_EMULATOR_LAUNCHER_DIR' in extra:
        require(pathlib.Path(target_environment['ANDROID_EMULATOR_LAUNCHER_DIR']).resolve()==emulator_root,'Foreign emulator launcher directory')
    for key in ['HOME','TMPDIR','XDG_CONFIG_HOME','XDG_CACHE_HOME','ANDROID_AVD_HOME','ANDROID_USER_HOME','ANDROID_EMULATOR_HOME']:
        require(pathlib.Path(config['environment'][key]).resolve().is_relative_to(root),'Operational environment path escapes private root')
    return root

def stop_owned_fixture(lease,path):
    require(sys.platform=='linux' and hasattr(os,'pidfd_open') and hasattr(signal,'pidfd_send_signal'),'Require Linux pidfd fixture cleanup')
    root=pathlib.Path(lease['root'])
    require(re.fullmatch(r'/home/runner/work/_temp/android-host-profile-\d+-[a-f0-9]{32}',str(root)) is not None,'Unexpected fixture root')
    require(root.resolve()==root and not root.is_symlink(),'Redirected fixture root')
    info=root.stat();require(info.st_uid==lease['runnerUid'] and stat.S_IMODE(info.st_mode)==0o700,'Foreign fixture root')
    confined(root,path)
    require(lease['nonce']==str(root).rsplit('-',1)[1],'Foreign fixture nonce')
    checked_environment(lease['targetEnvironment'],operational_environment(root))
    require(lease['target']['kind']=='synthetic-preflight' and pathlib.Path(lease['target']['exe'])==root/'scope-fixture','Foreign fixture executable')
    require(os.geteuid() in [0,lease['runnerUid']],'Foreign fixture cleanup UID')
    fd=os.pidfd_open(lease['target']['pid'],0)
    try:
        before=check_target(lease)
        signal.pidfd_send_signal(fd,signal.SIGTERM,None,0)
        return {'verified':True,'fixture':before,'stop':'pidfd SIGTERM','foreignProcessesSignalled':False}
    finally:
        os.close(fd)

def profiler_identity(config):
    ticket=json.loads(pathlib.Path(config['ticket']).read_text())
    require(ticket['nonce']==config['nonce'],'Foreign profiler ticket')
    before=identity(ticket['pid']);exact_identity(before,ticket)
    require(os.readlink(f"/proc/{ticket['pid']}/exe")==config['tool'],'Foreign profiler executable')
    command=pathlib.Path(f"/proc/{ticket['pid']}/cmdline").read_bytes().decode().split('\0')
    require([item for item in command if item]==config['command'],'Foreign profiler command')
    checked_environment(read_environment(ticket['pid']),config['environment'])
    exact_identity(identity(ticket['pid']),ticket)
    return ticket,before

def run(mode,path):
    config=json.loads(pathlib.Path(path).read_text())
    if mode=='stop-owned-fixture':
        print(json.dumps(stop_owned_fixture(config,path)))
        return
    validate_config(config,path)
    if mode=='start':
        check_target(config)
        expected=[config['tool'],'-B','line','-kk','-p',str(config['target']['pid']),'-o',config['output'],config['program']]
        require(config['command']==expected,'Unapproved profiler arguments')
        ticket={**identity(os.getpid()),'nonce':config['nonce'],'toolSha256':config['toolSha256'],'programSha256':config['programSha256']}
        fd=os.open(config['ticket'],os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
        with os.fdopen(fd,'w') as stream:
            os.fchown(stream.fileno(),config['runnerUid'],config['runnerGid']);json.dump(ticket,stream);stream.write('\n')
        os.umask(0o077)
        # Three raw streams (trace output, launcher stdout, stderr) each have a
        # kernel-enforced64MiB file bound: <=192MiB, below the256MiB raw budget.
        # A limit hit remains a technical failure/partial artifact, never green.
        resource.setrlimit(resource.RLIMIT_FSIZE,(67108864,67108864))
        resource.setrlimit(resource.RLIMIT_CORE,(0,0))
        exec_profiler(config)
    ticket=json.loads(pathlib.Path(config['ticket']).read_text())
    require(ticket.get('nonce')==config['nonce'],'Foreign profiler ticket')
    # pidfd is acquired before subsequent identity checks. If the process exits
    # after validation, pidfd_send_signal can never signal a reused numeric PID.
    try:
        fd=os.pidfd_open(ticket['pid'],0)
    except ProcessLookupError:
        print(json.dumps({'verified':True,'exited':True,'originalProfiler':ticket,'foreignProcessesSignalled':False}))
        return
    try:
        actual=identity(ticket['pid'])
        if actual['startTicks']!=ticket['startTicks']:
            # Only a birth field is read from a reused numeric PID. Never read
            # its exe/command/environment or send it a signal.
            print(json.dumps({'verified':True,'exited':True,'reusedAfterExit':True,'originalProfiler':ticket,'foreignProcessesSignalled':False}))
            return
        ticket,before=profiler_identity(config)
        if mode=='inspect':
            print(json.dumps({'verified':True,'exited':False,'profiler':before,'exe':config['tool'],'exeSha256':config['toolSha256'],'environmentKeys':sorted(config['environment']),'rawEnvironmentValuesLogged':False}))
        elif mode=='stop':
            signal.pidfd_send_signal(fd,signal.SIGINT,None,0)
            print(json.dumps({'verified':True,'profiler':before,'stop':'pidfd SIGINT','foreignProcessesSignalled':False}))
        else:
            raise RuntimeError('Unknown privileged action')
    finally:
        os.close(fd)

if __name__=='__main__':
    try:
        require(len(sys.argv)==3 and sys.argv[1] in ['start','inspect','stop','stop-owned-fixture'],'Unexpected privileged invocation')
        run(sys.argv[1],sys.argv[2])
    except Exception as error:
        # Never dump environment/config values or command output on failure.
        print(json.dumps({'ok':False,'error':str(error),'type':type(error).__name__}),file=sys.stderr)
        sys.exit(1)
