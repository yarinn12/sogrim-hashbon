#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

/* A single synthetic cloud preflight. No application, network, secret, warmup,
 * system process profiling or alternate emulator is involved. The late thread
 * and busy fork must both execute CPU work; only the same-TGID thread may appear. */
static _Thread_local volatile unsigned long sink;
static unsigned long long thread_cpu;
static pid_t late_tid;
static unsigned long long ns(clockid_t clock) {
  struct timespec t; if (clock_gettime(clock,&t)) _exit(81);
  return (unsigned long long)t.tv_sec*1000000000ULL+t.tv_nsec;
}
__attribute__((noinline)) static unsigned long long work(void) {
  unsigned long long a=ns(CLOCK_THREAD_CPUTIME_ID),end=ns(CLOCK_MONOTONIC)+2000000000ULL;
  while(ns(CLOCK_MONOTONIC)<end) { for(unsigned i=0;i<10000;i++) sink=sink*1664525UL+1013904223UL; }
  return ns(CLOCK_THREAD_CPUTIME_ID)-a;
}
static void *late_thread(void *unused) {
  (void)unused; late_tid=(pid_t)syscall(SYS_gettid); thread_cpu=work(); return NULL;
}
int main(int argc,char **argv) {
  if(argc!=5) return 82;
  FILE *ready=fopen(argv[1],"wx"); if(!ready) return 83;
  fprintf(ready,"%d\n",getpid()); if(fclose(ready)) return 84;
  unsigned long long deadline=ns(CLOCK_MONOTONIC)+30000000000ULL;
  while(access(argv[2],F_OK)) { if(errno!=ENOENT||ns(CLOCK_MONOTONIC)>deadline)return 85; struct timespec delay={0,10000000}; nanosleep(&delay,NULL); }
  int pipefd[2]; if(pipe2(pipefd,O_CLOEXEC)) return 86;
  pid_t child=fork(); if(child<0)return 87;
  if(child==0) { close(pipefd[0]);unsigned long long cpu=work();if(write(pipefd[1],&cpu,sizeof(cpu))!=sizeof(cpu))_exit(88);close(pipefd[1]);_exit(0); }
  close(pipefd[1]);pthread_t thread;if(pthread_create(&thread,NULL,late_thread,NULL))return 89;
  unsigned long long parent_cpu=work(),fork_cpu=0;if(pthread_join(thread,NULL))return 90;
  if(read(pipefd[0],&fork_cpu,sizeof(fork_cpu))!=sizeof(fork_cpu))return 91;close(pipefd[0]);
  int status;if(waitpid(child,&status,0)!=child||!WIFEXITED(status)||WEXITSTATUS(status))return 92;
  FILE *result=fopen(argv[3],"wx");if(!result)return 93;
  fprintf(result,"{\"pid\":%d,\"mainTid\":%d,\"lateThreadTid\":%d,\"forkPid\":%d,\"lateThreadStartedAfterGo\":true,\"parentCpuNs\":%llu,\"threadCpuNs\":%llu,\"forkCpuNs\":%llu}\n",getpid(),(int)syscall(SYS_gettid),late_tid,child,parent_cpu,thread_cpu,fork_cpu);
  if(fclose(result))return 94;
  /* Keep the known target alive while the profiler flushes once under pidfd
   * control. This avoids racing an automatic -p exit against a second signal. */
  deadline=ns(CLOCK_MONOTONIC)+15000000000ULL;
  while(access(argv[4],F_OK)){if(errno!=ENOENT||ns(CLOCK_MONOTONIC)>deadline)return 95;struct timespec delay={0,10000000};nanosleep(&delay,NULL);}
  return 0;
}
