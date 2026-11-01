import {test,expect,chromium,webkit,devices} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createBitProfileDatabase,BIT_USERS,BIT_LINKS} from '../tests/helpers/bitProfileDatabase.mjs';

// Two browser engines and a third independent client, backed by real candidate
// PostgreSQL functions. Only hosted authentication and PostgREST are simulated.
test('optional QR profiles stay account-owned and synchronize replacement/removal across clients',async({},testInfo)=>{
  const fixture=await createBitProfileDatabase();await fixture.begin();
  const browsers=[],contexts=[],errors=[];
  try{
    const bootstrap=await readFile(new URL('../e2e/fixtures/profileIdentityBootstrap.js',import.meta.url),'utf8');
    const chrome=await chromium.launch();browsers.push(chrome);
    const apple=await webkit.launch();browsers.push(apple);
    async function client(browser,index,device){
      const context=await browser.newContext({...devices[device],locale:'he-IL',timezoneId:'Asia/Jerusalem',serviceWorkers:'block',reducedMotion:'reduce'});contexts.push(context);
      let source=bootstrap.replace("actor='11111111-1111-4111-8111-111111111111'",`actor='${BIT_USERS[index]}'`)
        .replace('const config={publicUrl:','const config={features:{bitQrProfile:true},publicUrl:')
        .replace("    if(url.pathname==='/api/config')","    if(['get_my_bit_shortcut','set_my_bit_shortcut','get_transfer_bit_shortcut'].includes(url.pathname.split('/rpc/')[1]))return original(input,options);\n    if(url.pathname==='/api/config')");
      if(index===1)source=source.replace(":'נועם לוי';",":'דנה כהן';");
      await context.addInitScript({content:source});
      await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
      await context.route(/\/rest\/v1\/rpc\/(get_my_bit_shortcut|set_my_bit_shortcut|get_transfer_bit_shortcut)$/,async route=>{
        const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST,OPTIONS','access-control-allow-headers':'authorization,apikey,content-type','content-type':'application/json','cache-control':'no-store'};
        if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers,body:''});return;}
        const cfg=fixture.config(index),name=new URL(route.request().url()).pathname.split('/').at(-1);
        const response=await fetch(cfg.storage.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{authorization:'Bearer '+cfg.storage.account.accessToken,'content-type':'application/json'},body:route.request().postData()});
        await route.fulfill({status:response.status,headers,body:await response.text()});
      });
      const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
      await page.goto(testInfo.project.use.baseURL+'/');
      await page.getByRole('button',{name:'פרופיל',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Bit לא חובה',exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:'רענן את פרטי Bit',exact:true})).toBeEnabled();
      return page;
    }
    const a=await client(chrome,0,'Pixel 5'),b=await client(apple,1,'iPhone 13');
    async function add(page,file){
      await page.locator('[data-bit-file]').setInputFiles(fileURLToPath(new URL('../tests/fixtures/'+file,import.meta.url)));
      await expect(page.getByRole('button',{name:'שמור קיצור Bit',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'שמור קיצור Bit',exact:true}).click();
      await expect(page.locator('.bit-profile-status')).toHaveText('קיצור Bit נשמר בחשבון.');
    }
    await add(a,'bit-profile-a.png');await add(b,'bit-profile-b.png');
    let rows=(await fixture.db.query('select user_id,bit_url,revision from private.user_bit_shortcuts order by user_id')).rows;
    expect(rows.map(row=>[row.user_id,row.bit_url,row.revision])).toEqual([[BIT_USERS[0],BIT_LINKS[0],1],[BIT_USERS[1],BIT_LINKS[1],1]]);
    const secondA=await client(chrome,0,'Pixel 5');
    await expect(secondA.getByRole('button',{name:'הסר את קיצור Bit',exact:true})).toBeVisible();
    await a.getByRole('button',{name:'הסר את קיצור Bit',exact:true}).click();
    await expect(a.locator('.bit-profile-status')).toHaveText('קיצור Bit הוסר מהחשבון.');
    await secondA.getByRole('button',{name:'רענן את פרטי Bit',exact:true}).click();
    await expect(secondA.getByRole('button',{name:'הסר את קיצור Bit',exact:true})).toHaveCount(0);
    await expect(secondA.getByRole('button',{name:'בחר תמונת QR',exact:true})).toBeEnabled();
    await b.getByRole('button',{name:'רענן את פרטי Bit',exact:true}).click();
    await expect(b.getByRole('button',{name:'הסר את קיצור Bit',exact:true})).toBeEnabled();
    rows=(await fixture.db.query('select user_id,bit_url,revision from private.user_bit_shortcuts order by user_id')).rows;
    expect(rows.map(row=>[row.user_id,row.bit_url,row.revision])).toEqual([[BIT_USERS[0],null,2],[BIT_USERS[1],BIT_LINKS[1],1]]);
    await b.locator('.bit-profile-section').screenshot({path:testInfo.outputPath('bit-profile-account-b-saved.png')});
    expect(errors).toEqual([]);
  }finally{
    for(const context of contexts)await context.close();for(const browser of browsers)await browser.close();
    await fixture.rollback();await fixture.close();
  }
});
