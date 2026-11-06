import contextlib, hashlib, importlib.util, io, json, os, pathlib, stat, sys, tempfile, unittest
from types import SimpleNamespace
from unittest.mock import patch
path=pathlib.Path(__file__).resolve().parents[1]/'scripts/qa/android-host-profile/root-control.py'
spec=importlib.util.spec_from_file_location('host_profile_root',path)
root=importlib.util.module_from_spec(spec);spec.loader.exec_module(root)
NODE_PROGRAM=json.loads(sys.stdin.read())['nodeProgram']

class RootBodyControls(unittest.TestCase):
    def setUp(self):
        # These are synthetic Linux FD-flag controls on Windows, where Python
        # omits O_ACCMODE. The real CLI still requires Linux/fcntl; no fallback.
        if not hasattr(root.os,'O_ACCMODE'):
            access_mask=patch.object(root.os,'O_ACCMODE',3,create=True);access_mask.start();self.addCleanup(access_mask.stop)
        self.temp=tempfile.TemporaryDirectory(prefix='host-profile-root-')
        self.path=pathlib.Path(self.temp.name)/'profile.bt'
        self.target={'pid':1234,'startTicks':'999'}
        self.good=root.approved_program(self.target,100)
    def tearDown(self): self.temp.cleanup()
    def config(self,text):
        self.path.write_text(text,encoding='utf-8')
        return {'program':str(self.path),'programSha256':hashlib.sha256(self.path.read_bytes()).hexdigest(),'target':self.target,'tool':'/usr/bin/bpftrace','command':['/usr/bin/bpftrace'],'environment':{}}
    def rejected_before_exec(self,text):
        calls=[];config=self.config(text)
        # The digest deliberately matches the corrupted body. It is insufficient.
        with self.assertRaisesRegex(RuntimeError,'Unapproved probe body'):
            root.exec_profiler(config,execve=lambda *args:calls.append(args),clock_ticks=100)
        self.assertEqual(calls,[])
    def test_valid_exact_body_passes_privileged_body_check(self):
        root.validate_program(self.config(self.good),100)
    def test_node_and_privileged_python_independent_templates_match(self):
        self.assertEqual(NODE_PROGRAM,self.good)
    def test_changed_body_and_matching_hash_do_not_authorize_global_stack_collection(self):
        self.rejected_before_exec(self.good.replace('/pid == 1234/','/1/'))
    def test_changed_body_and_matching_hash_do_not_authorize_missing_birth_guard(self):
        self.rejected_before_exec(self.good.replace('if (($leader->start_boottime / 10000000) == 999)','if (1)'))
    def test_changed_body_and_matching_hash_do_not_authorize_a_kernel_stack(self):
        self.rejected_before_exec(self.good.replace('ustack(raw, 32)','kstack(raw, 32)'))
    def test_early_stack_read_is_rejected(self):
        self.rejected_before_exec(self.good.replace('  $leader =','  @leak[ustack(raw, 32)]=count();\n  $leader ='))
    def test_reused_birth_is_rejected(self):
        self.rejected_before_exec(self.good.replace('== 999)','== 1000)'))
    def test_foreign_tgid_is_rejected(self):
        self.rejected_before_exec(self.good.replace('pid == 1234','pid == 9999'))
    def test_extra_privileged_helper_is_rejected(self):
        self.rejected_before_exec(self.good+'BEGIN { system("private"); }\n')
    def test_wrong_kernel_clock_divisor_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'Unapproved probe body'):
            root.validate_program(self.config(self.good),1000)
    def test_malformed_identity_is_rejected(self):
        with self.assertRaises(RuntimeError): root.approved_program({'pid':1234,'startTicks':'999) {bad;}'},100)
    def test_actual_environment_key_leak_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'environment keys'):
            root.checked_environment({'HOME':'/owned','GITHUB_TOKEN':'sentinel'},{'HOME':'/owned'})
    def test_actual_environment_value_leak_is_not_printed(self):
        with self.assertRaisesRegex(RuntimeError,'environment value: HOME') as error:
            root.checked_environment({'HOME':'SECRET_SENTINEL'},{'HOME':'/owned'})
        self.assertNotIn('SECRET_SENTINEL',str(error.exception))
    def test_privileged_environment_does_not_trust_matching_corrupt_config_values(self):
        base='/home/runner/work/_temp/android-host-profile-123-'+'a'*32
        good={**root.operational_environment(base),'BPFTRACE_BTF':'/sys/kernel/btf/vmlinux','BPFTRACE_MAX_MAP_KEYS':'65536','BPFTRACE_LOG_SIZE':'1048576','BPFTRACE_STACK_MODE':'raw'}
        root.checked_profiler_environment(good,base)
        for key in good:
            with self.subTest(key=key),self.assertRaises(RuntimeError) as error:root.checked_profiler_environment({**good,key:'SECRET_SENTINEL'},base)
            self.assertNotIn('SECRET_SENTINEL',str(error.exception))
    def test_pid_reuse_is_rejected(self):
        with self.assertRaisesRegex(RuntimeError,'reused'):
            root.exact_identity({'pid':1234,'startTicks':'1000'},self.target)
    def stop_config(self):
        ticket=pathlib.Path(self.temp.name)/'ticket.json';ticket.write_text(json.dumps({**self.target,'nonce':'owned'}),encoding='utf-8')
        config=pathlib.Path(self.temp.name)/'config.json';config.write_text(json.dumps({'ticket':str(ticket),'nonce':'owned'}),encoding='utf-8')
        return config
    def test_foreign_ticket_cannot_claim_cleanup_verified_when_pid_is_absent(self):
        config=self.stop_config();value=json.loads(config.read_text());ticket=pathlib.Path(value['ticket']);ticket.write_text(json.dumps({**self.target,'nonce':'foreign'}),encoding='utf-8');events=[]
        def missing(*args):events.append('pidfd');raise ProcessLookupError()
        with patch.object(root,'validate_config'),patch.object(root.os,'pidfd_open',missing,create=True),contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError,'Foreign profiler ticket'):root.run('inspect',str(config))
        self.assertEqual(events,[])
    def test_pidfd_reuse_never_reads_foreign_exe_or_sends_signal(self):
        config=self.stop_config();events=[];stdout=io.StringIO()
        with patch.object(root,'validate_config'),patch.object(root.os,'pidfd_open',lambda pid,flags:events.append('pidfd') or 123,create=True),patch.object(root.os,'close',lambda fd:events.append('close')),patch.object(root,'identity',return_value={'pid':1234,'startTicks':'1000'}),patch.object(root,'profiler_identity',side_effect=AssertionError('Must not read reused process')),patch.object(root.signal,'pidfd_send_signal',lambda *args:events.append('SIGNAL'),create=True),contextlib.redirect_stdout(stdout):
            root.run('stop',str(config))
        self.assertEqual(events,['pidfd','close']);self.assertTrue(json.loads(stdout.getvalue())['reusedAfterExit'])
    def test_foreign_profiler_command_never_receives_signal(self):
        config=self.stop_config();events=[]
        with patch.object(root,'validate_config'),patch.object(root.os,'pidfd_open',lambda *args:events.append('pidfd') or 123,create=True),patch.object(root.os,'close',lambda fd:events.append('close')),patch.object(root,'identity',return_value=self.target),patch.object(root,'profiler_identity',side_effect=RuntimeError('Foreign profiler command')),patch.object(root.signal,'pidfd_send_signal',lambda *args:events.append('SIGNAL'),create=True):
            with self.assertRaisesRegex(RuntimeError,'Foreign profiler command'):root.run('stop',str(config))
        self.assertEqual(events,['pidfd','close'])
    def test_missing_ticket_never_issues_a_numeric_signal_fallback(self):
        config=pathlib.Path(self.temp.name)/'config.json';config.write_text(json.dumps({'ticket':str(pathlib.Path(self.temp.name)/'missing')}),encoding='utf-8');events=[]
        with patch.object(root,'validate_config'),patch.object(root.os,'pidfd_open',lambda *args:events.append('pidfd'),create=True),patch.object(root.signal,'pidfd_send_signal',lambda *args:events.append('SIGNAL'),create=True):
            with self.assertRaises(FileNotFoundError):root.run('stop',str(config))
        self.assertEqual(events,[])
    def info_config(self):
        config=self.config(self.good);config['output']='/owned/profile.txt'
        config['command']=[config['tool'],'-B','line','-kk','-p','1234',config['program']]
        config['environment']={'PATH':'/fixed','BPFTRACE_STACK_MODE':'raw'}
        return config
    def test_info_exec_uses_only_fixed_metadata_argv_and_the_exact_guarded_environment(self):
        config=self.info_config();calls=[]
        with patch.object(root,'check_target',return_value=self.target) as checked:
            with self.assertRaisesRegex(AssertionError,'exec returned'):
                root.exec_info(config,execve=lambda *args:calls.append(args),clock_ticks=100)
        checked.assert_called_once_with(config)
        self.assertEqual(calls,[(config['tool'],[config['tool'],'--info'],config['environment'])])
    def test_info_corrupt_body_with_matching_hash_never_executes_or_reads_target(self):
        config=self.info_config();self.path.write_text(self.good.replace('/pid == 1234/','/1/'),encoding='utf-8');config['programSha256']=hashlib.sha256(self.path.read_bytes()).hexdigest();calls=[]
        with patch.object(root,'check_target',side_effect=AssertionError('No target read after invalid config')):
            with self.assertRaisesRegex(RuntimeError,'Unapproved probe body'):
                root.exec_info(config,execve=lambda *args:calls.append(args),clock_ticks=100)
        self.assertEqual(calls,[])
    def test_info_foreign_tool_or_injected_command_never_executes(self):
        for change in [{'tool':'/private/profiler'},{'command':['/usr/bin/bpftrace','--info','-e','bad']}]:
            config={**self.info_config(),**change};calls=[]
            with self.subTest(change=change),patch.object(root,'check_target',side_effect=AssertionError('No target read after invalid argv')):
                with self.assertRaises(RuntimeError):root.exec_info(config,execve=lambda *args:calls.append(args),clock_ticks=100)
            self.assertEqual(calls,[])
    def test_info_reused_target_birth_never_executes(self):
        config=self.info_config();calls=[]
        with patch.object(root,'identity',return_value={'pid':1234,'startTicks':'1000'}):
            with self.assertRaisesRegex(RuntimeError,'reused process identity'):
                root.exec_info(config,execve=lambda *args:calls.append(args),clock_ticks=100)
        self.assertEqual(calls,[])
    def test_info_cli_keeps_full_existing_config_validation_before_exec(self):
        path=pathlib.Path(self.temp.name)/'info.json';path.write_text(json.dumps(self.info_config()),encoding='utf-8')
        with patch.object(root,'validate_config',side_effect=RuntimeError('Invalid executable SHA/environment/config')) as validated,patch.object(root,'exec_info') as execute:
            with self.assertRaisesRegex(RuntimeError,'Invalid executable SHA/environment/config'):root.run('info',str(path))
        validated.assert_called_once();execute.assert_not_called()
    def stdout_config(self):
        return {**self.info_config(),'runnerUid':1001,'outputIdentity':{'device':'66305','inode':'987654'}}
    def output_stat(self,**changes):
        return SimpleNamespace(**{'st_mode':stat.S_IFREG|0o600,'st_uid':1001,'st_dev':66305,'st_ino':987654,**changes})
    def fd_flags(self,flags=None,descriptor_flags=0):
        return SimpleNamespace(F_GETFL=3,F_GETFD=1,FD_CLOEXEC=1,fcntl=lambda fd,kind: (os.O_WRONLY|os.O_APPEND if flags is None else flags) if kind==3 else descriptor_flags)
    def test_stdout_binding_reports_exact_private_inode_device_and_writable_inherited_fd(self):
        config=self.stdout_config();good=self.output_stat()
        with patch.object(root.pathlib.Path,'lstat',return_value=good),patch.object(root.os,'fstat',return_value=good),patch.object(root,'fcntl',self.fd_flags()):result=root.require_output_fd(config)
        self.assertEqual(result,{'verified':True,'fd':1,'path':config['output'],'device':'66305','inode':'987654','ownerUid':1001,'mode':'0600','writable':True,'closeOnExec':False})
    def test_wrong_stdout_device_or_inode_never_executes(self):
        for bad in [self.output_stat(st_dev=2),self.output_stat(st_ino=2)]:
            config=self.stdout_config();calls=[]
            with patch.object(root.pathlib.Path,'lstat',return_value=self.output_stat()),patch.object(root.os,'fstat',return_value=bad):
                with self.assertRaisesRegex(RuntimeError,'pinned identity'):root.exec_profiler(config,execve=lambda *args:calls.append(args),clock_ticks=100)
            self.assertEqual(calls,[])
    def test_foreign_owner_loose_mode_symlink_or_pipe_never_executes(self):
        for bad in [self.output_stat(st_uid=0),self.output_stat(st_mode=stat.S_IFREG|0o644),self.output_stat(st_mode=stat.S_IFLNK|0o600),self.output_stat(st_mode=stat.S_IFIFO|0o600)]:
            for where in ['path','fd']:
                calls=[];config=self.stdout_config()
                with self.subTest(where=where,mode=bad.st_mode,uid=bad.st_uid),patch.object(root.pathlib.Path,'lstat',return_value=bad if where=='path' else self.output_stat()),patch.object(root.os,'fstat',return_value=bad if where=='fd' else self.output_stat()):
                    with self.assertRaises(RuntimeError):root.exec_profiler(config,execve=lambda *args:calls.append(args),clock_ticks=100)
                self.assertEqual(calls,[])
    def test_readonly_or_close_on_exec_stdout_never_executes(self):
        for flags in [self.fd_flags(flags=os.O_RDONLY),self.fd_flags(descriptor_flags=1)]:
            calls=[];config=self.stdout_config()
            with patch.object(root.pathlib.Path,'lstat',return_value=self.output_stat()),patch.object(root.os,'fstat',return_value=self.output_stat()),patch.object(root,'fcntl',flags):
                with self.assertRaises(RuntimeError):root.exec_profiler(config,execve=lambda *args:calls.append(args),clock_ticks=100)
            self.assertEqual(calls,[])
    def test_output_path_swapped_after_fd_check_never_executes(self):
        calls=[];config=self.stdout_config()
        with patch.object(root.pathlib.Path,'lstat',side_effect=[self.output_stat(),self.output_stat(st_ino=2)]),patch.object(root.os,'fstat',return_value=self.output_stat()),patch.object(root,'fcntl',self.fd_flags()):
            with self.assertRaisesRegex(RuntimeError,'pinned identity'):root.exec_profiler(config,execve=lambda *args:calls.append(args),clock_ticks=100)
        self.assertEqual(calls,[])
    def test_valid_profiler_exec_keeps_exact_argv_after_verified_stdout_binding(self):
        calls=[];config=self.stdout_config()
        with patch.object(root.pathlib.Path,'lstat',return_value=self.output_stat()),patch.object(root.os,'fstat',return_value=self.output_stat()),patch.object(root,'fcntl',self.fd_flags()):
            with self.assertRaisesRegex(AssertionError,'exec returned'):root.exec_profiler(config,execve=lambda *args:calls.append(args),clock_ticks=100)
        self.assertEqual(calls,[(config['tool'],config['command'],config['environment'])]);self.assertNotIn('-o',calls[0][1])
    def test_separate_ofstream_argv_is_rejected_before_fd_read_or_exec(self):
        config=self.stdout_config();config['command']=config['command'][:-1]+['-o',config['output'],config['program']];calls=[]
        with patch.object(root.os,'fstat',side_effect=AssertionError('Bad argv must fail before FD reads')):
            with self.assertRaisesRegex(RuntimeError,'Unapproved profiler arguments'):root.exec_profiler(config,execve=lambda *args:calls.append(args),clock_ticks=100)
        self.assertEqual(calls,[])

if __name__=='__main__': unittest.main()
