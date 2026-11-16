// Retain a cleanup handle before the first fallible startup operation. Every
// failure path closes the verified profiler, then its separately owned fixture.
// An unavailable identity is reported, never replaced by a numeric-PID signal.
export async function withStartupCleanup({begin,work,closeProfile,closeFixture,recordUnavailable}){
  let handle=null,profileClosed=false,value,failure;const cleanupErrors=[];
  const retain=next=>{if(handle&&handle!==next)throw new Error('Profile handle replaced during one-shot startup');handle=next;};
  const markClosed=verified=>{profileClosed=verified===true;};
  try{const started=await begin(retain);if(started)retain(started);value=await work(handle,markClosed);}
  catch(error){handle??=error.profileHandle??null;failure=error;}
  finally{
    if(handle&&!profileClosed)try{
      const result=await closeProfile(handle);profileClosed=result?.verified===true;
      if(!profileClosed)cleanupErrors.push('Profiler cleanup identity/exit unverified');
    }catch(error){cleanupErrors.push('Profiler cleanup failed: '+error.message);}
    try{const result=await closeFixture();if(result?.verified!==true)cleanupErrors.push('Fixture cleanup identity/exit unverified');}
    catch(error){cleanupErrors.push('Fixture cleanup failed: '+error.message);}
    if(cleanupErrors.length)await recordUnavailable({verified:false,errors:cleanupErrors,noFurtherCommands:true});
  }
  if(failure){failure.cleanupErrors=cleanupErrors;throw failure;}
  if(cleanupErrors.length)throw new Error(cleanupErrors.join('; '));
  return value;
}
