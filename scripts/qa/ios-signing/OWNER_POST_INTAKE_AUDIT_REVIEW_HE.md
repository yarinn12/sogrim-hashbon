# אודיט נפרד אחרי TestFlight intake — תבנית חסומה בלבד

הכנה בזיכרון עבור Root, לא workflow פעיל, לא קבלת העלאה, לא קבלת זמינות לבודק ולא הרשאת הפצה. אין שינוי ב־collector79ff, ב־owner core, במתאם0daf או בכלי signing5d/intake8db. אין POST, CLI, קריאת מפתחות, גישת קבצים, upload או fetch ברמת המודול החדש.

## החסם המחייב לפני Apple keys

כל הקשירות האמיתיות ב־AUDIT_PINS הן PENDING: מקור/tree/ענף, ארבע ריצות CI, כלי האודיט/tree/run/job, hashes של collector/client, Build ID של194, מקור החתימה וארטיפקטה, מקור ה־intake/כליו/run/job וארטיפקט הראיות/digest/size/postflight hash.

runOwnerReadOnlyAudit אינו מקבל dependencies או credentials. הוא בודק PENDING לפני כל עבודה; גם אם ממלאים את הקבועים הוא זורק במפורש: חסרים מאמת משותף של intake מוצלח וארטיפקט הראיות שלו, ואינטגרציית namespace/provenance לאודיט העצמאי. אין TODO שמחזיר success ואין callback שמתחזה לשער מאומת. אין להסיר את החסם רק מפני שהבדיקות הסינתטיות עברו.

Root אישר שמאמת intake מצומצם ייושם על נתוני אמת אחרי intake ולפני Apple keys. הוא אינו קיים בממשק המשותף שנקרא כאן. התבנית אינה ממציאה לו שם/API, אינה משכפלת מאות שורות guards ואינה משתמשת במתאם0daf כדי לעקוף את הפער.

## שימוש חוזר ומיפוי שערים — לפני מפתחות Apple

1. לקבע handoff סופי: source SHA/tree/branch, ארבע ריצות מקור וכל התפקידים הנדרשים, כלי חתימה וכלי intake בלתי משתנים, מקור החבילה, מספר194 ו־Build ID אמיתי. אין כאן קבלת8f5 או כל מקור אחר. QA466 38729651372, Windows147 38729651438, Font58 38729651387 ו־Auth42 38729651671 נמסרו כריצות בתהליך; אף מזהה אינו קשור כעת בקוד.
2. לאמת checkout ותכני כל מאמת/collector/client מול מקור הכלים הבלתי משתנה. intake-source-guard.mjs ב־8db מייצא verifyCommit(fetchImpl,token,tree) ו־verifyRuns(fetchImpl,token,env). לאחר קשירת המקור הסופי יש להשתמש בהם מחדש, בלי העתקת לוגיקת CI. verifyCommit בודק GitHub commit/tree. verifyRuns בודק repo/branch/SHA/path/event/status/success/attempt1, את כל ה־jobs ואת16 תפקידי QA הנדרשים, בתוספת התפקיד הייעודי ב־Windows/Font/Auth. אלו16 תפקידים ב־QA ולא טענה שיש רק16 jobs בסך הכול.
3. המקור הקיים ב־8db עדיין מקובע ל־3606; top-level assertion של SOURCE_SHA וה־RELEASE_SOURCE יחסום8f5 בכוונה. verifyCheckout הוא ממשק קיים אך מקובע גם ל־namespace של intake3606; אין להציגו כמוכן לאודיט עצמאי. נדרשת אינטגרציה נפרדת שנקשרה ונקראה בחזרה. אין לשנות את8db המשותף במסגרת הכנה זו.
4. לאמת את החתימה המקורית ואת ארטיפקט המקור. verifyOrigin(run,artifact,jobs,env,now) ב־intake194-package-origin.mjs ו־verifyIntakeOrigin(run,artifact,jobs,env) ב־intake-origin-guard.mjs קיימים. למרות השם, הם מאמתים את ריצת SIGNING ואת הארטיפקט המוצפן שלה, לא את ריצת intake שהצליחה. יש לבדוק exact tool/run/job/attempt/repo/path/source, artifact ID/name/size/expiry/ZIP digest, IPA hash, AES AAD וכל ראיות source/package/WWW/codesign/profile המקוריות לפי חוזה הכלים. אלה תנאים למאמת עתידי, לא בדיקות שבוצעו כאן.
5. חסר API משותף שמאמת את ריצת ה־intake המוצלחת ואת job/tool/source/attempt שלה, את artifact הראיות שנוצר אחרי ההעלאה ואת ZIP digest/size/שיוך הריצה, ואת חברותו של כל קובץ מקור ב־ZIP מול hash הבתים המקורי. עליו לקשור את postflight ל־App6809952514/IOS4.58/194 ול־Build ID אמיתי VALID, ל־IPA ולמקור החתימה המדויקים. JSON עם success=true או קובץ completion לבדו אינו אימות. אין להמיר false של database/public/distribution ל־true.
6. חסרה גם קשירת namespace/run/job/tool/tree של האודיט העצמאי. GITHUB_JOB הוא שם job ואינו מזהה job מספרי. יש לאמת provenance מול נתוני GitHub אמת, לא להמציא מזהה ממחרוזת סביבה.
7. רק אחרי שערים אלו ומקור כלים שנקרא בחזרה מותר לאינטגרציה עתידית לטעון את מפתחות Apple הקיימים וליצור את הלקוח הקיים. ה־wrapper הפרטי בהכנה זו אינו מחליף את שלבים1–6 ואינו נגיש מהכניסה הציבורית.

## חוזה ה־GET הפרטי

collectAuditTemplate הוא wiring פרטי בלבד ל־createAppStoreClient הקיים מ־scripts/lib/app-store-release.mjs ול־collectOwnerSnapshot של79ff. הוא אינו export. הקוד הציבורי אינו קורא לו, והבדיקות חושפות אותו רק בעותק מקור מבודד בזיכרון. אין להעתיק את מסלול חשיפת הבדיקות ל־runtime.

לקוח Apple הקיים מגדיר redirect:"error" בכל fetch. ה־wrapper מוסיף גבול GET-only: method/redirect מפורשים, ללא body, origin קבוע, App קבוע ו־Build ID קבוע, וקריאות הדפים של collector בלבד. אין global apps/builds/betaTesters או קבוצות לא מסוננות. /v1/betaGroups מחייב גם filter[app] וגם filter[builds]. group/store IDs נוספים נפתחים רק מתוצאות רשימות של ה־App; old-build identity reads נפתחים רק מקישורי קבוצות או Store שכבר נקשרו ל־App. ה־collector ממשיך לאמת ownership/type/pagination/total/קישוריות; ה־wrapper לא משכפל pagination. אין endpoint חדש או פרטי.

fetch שהלקוח מפעיל חייב להתאים ל־URL שאושר לאותה בקשה, עם GET ו־redirect:error וללא body. אין wrapper retry. ללקוח הקיים יש חידוש JWT יחיד ב־401; הוא נשאר GET ואינו הופך לתיקון אוטומטי של אודיט שנכשל.

## תוצרים ואי־תלות ב־upload

התבנית מחזירה שלושה Buffers בלבד: snapshot, evidence ו־provenance. היא מסדרת כל אובייקט מקורי פעם אחת באמצעות JSON.stringify(value,null,2) ושורת LF בסוף. זו קנוניזציה מוגדרת של אובייקטי collector, לא בתים מקוריים של תגובת HTTP. אין המרת null ל־false, שינוי notes, reset של observedAt או מחיקת מגבלות מהראיות. provenance מכיל את כל הקשירות וכן SHA256 של שני הקבצים. hashes של קובצי התוצר אינם תחליף לאימות מקור הריצה/הארטיפקט.

provenance הוא קלט ל־helper הפרטי, לא attest API מיושם. האינטגרציה החסרה חייבת לאמת אותו לפני הפעלה. evidence.transportAttestation נשאר NOT_PROVIDED_BY_THIS_COLLECTOR; ה־wrapper אינו משכתב אותו לטענת אימות רשת. אין כתיבה לקבצים או העלאת artifact בתבנית. אין החלטת owner association או יצירת קבלת owner core.

הסדר העתידי הוא:
- intake מסתיים ונשמרת קבלת ההעלאה המקורית.
- מתחיל אודיט נפרד ב־run/job וארטיפקט נפרדים, אחרי אימות השלבים שלעיל.
- האודיט מפיק snapshot/evidence/provenance עצמם. כשלו נרשם כאודיט נכשל בלבד; הוא אינו משנה בדיעבד upload success, אינו גורם rebuild/re-upload ואינו מוסיף collector step כדרישת הצלחה ל־intake job.
- מתאם0daf עדיין מניח collector step בתוך intake job. אין להשתמש בו במסלול הנפרד לפני קשירה מפורשת למקור run/tool/artifact של האודיט ואישור הסקירה המתאימה.
- פעולה עתידית של שיוך לבעלים היא שלב אחר. אודיט GET אינו מבצע אותה ואינו מוכיח זמינות לבעלים. יש לשמר baseline חי של כל הגישות, בלי להניח שה־Build הקודם הוא193.

## אימות ההכנה

50 בקרות Node סינתטיות עברו בקריאת stdin; מקור המודול והתלויות הוזרקו בזיכרון, לא נטען קובץ audit חדש מהדיסק. הן מכסות PENDING לפני גישה לתלויות, חסם האינטגרציה גם בקבועים סינתטיים מלאים, GET/redirect/body/origin/scoping/הענקת IDs, התנהגות שגיאה ללא retry ובלי הרשאת fetch שנותרת פתוחה, ושימור snapshot/evidence/provenance.

שתי בקרות שילוב הריצו את ה־collector הקיים מהדיסק מול transport סינתטי בלבד, לפני ואחרי שיוך סינתטי, ובקרה נוספת אימתה כשל ownership. במקומי קובץ ה־collector הוא14798 bytes, raw SHA256 ee9bd10a9c976955eda333fdb7001faf1e5d81d1d46643303aba55482f6c30b8; לאחר LF canonical מפורש הוא זהה למקור הקודם שנקרא, SHA256 8ae95ea13247b21fff19aa0f548b2a75d8b08acd00f811df2b71c64b5c30710d. זה אימות קריאת קובץ, לא Git readback עצמאי של79ff.

Root יכול להריץ node --test על קובצי ההכנה שיישמרו בתיקייה מבודדת לצד collector79ff. כל הקבועים נשארים PENDING. הבדיקות אינן Mac/codesign, נתוני intake אמיתיים, תצפית Apple, קבלת CI, הפעלה או הוכחת זמינות TestFlight. לא נטענו מפתחות ולא בוצעו קריאות Apple. אין workflow פעיל ב־patch.


## קבלת Root המקומית

Root אימת את patch המקור בטביעת cc230cc05c3206e0536653c2583af984a86f8884efcd5b71bdea6271cd94a9e4 ושמר שלושה קבצים בלבד בענף מבודד מבסיס0daf.50 מתוך50 בדיקות האודיט עברו;149 מקרי Node חיצוניים של core/collector/adapter/audit עברו יחד. סקירת QA נסגרה ללא חוסם כהכנה חסומה. הסוויטה הפרטית הסתיימה עם3,637 הצלחות ושני כשלי החוזה הציבורי/בנייה193 מתוך3,639, ללא דילוגים; שני הכשלים זהים לבסיס הקודם ולא הוחלשו. src לא שונה. אין טענה לסוויטה פרטית ירוקה או לקבלת מקור האפליקציה באמצעות הבסיס הפרטי. כל החסמים וה־PENDING נשארים; לא בוצעו קריאות Apple או הפעלה.
