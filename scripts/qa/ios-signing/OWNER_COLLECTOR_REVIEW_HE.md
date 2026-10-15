# Collector ל־owner snapshot — הכנה לסקירה בלבד

בסיס חוזה ה־owner core הוא commit `98bbccd6d2d4a9968992971b1e62cb222ea1788b`. הקובץ החדש עצמאי ואינו משנה אותו, את חתימת האפליקציה, את ה־intake או את guards הציבור/מסד. אין collector CLI, workflow, transport, מפתחות או פנייה חיה ל־Apple. הקוד והבדיקות הוכנו בזיכרון בלבד; אין כתיבה, בקשת הרשאה, push או שינוי אוטומציה.

`collectOwnerSnapshot(api, {appId, buildId})` מחזיר `{snapshot, evidence}`. מעבירים **רק** את `snapshot` לחוזה ה־core ושומרים את `evidence` כקבלה נפרדת. appId חייב להיות6809952514, ה־bundle קבוע, ו־buildId הוא מזהה194 אמיתי שיועבר מקבלת ה־intake העתידית. אין מזהה194 אמיתי או קבלה שמאשרת פעולה בהכנה הזו. אין שום הסתמכות בקוד על10837 או על מזהה193 היסטורי.

ה־snapshot מכיל בדיוק את שדות ה־core: app/build/prerelease/beta state/notes, כל קבוצות האפליקציה ודגליהן, מזהי בניות וחברי כל קבוצה, קבוצות194 לפי אוסף מסונן נפרד, individual testers של194, יחסי Store דו־כיווניים, וכל גרסאות iOS בחנות עם הבנייה המשויכת לכל אחת. מזהי tester.groupIds נגזרים מאיחוד חברויות בכל קבוצות האפליקציה. זו אינה קריאת בודקים גלובלית בחשבון או הוכחה שאין בודק מחוץ לקבוצות בבניות אחרות.

## קריאות ותיעוד Apple ראשי

כל בקשה למתאם המוזרק היא `{method:'GET', redirect:'error'}`. אין שימוש ב־fetch או ב־environment בקוד. המתאם העתידי חייב בעצמו לאכוף origin של Apple, חסימת redirects, HTTP errors ו־timeout; collector עם mock אינו יכול להוכיח שהתבצעה קריאת רשת חיה. מתאם שמתעלם מ־redirect:'error' דורש תיקון ובדיקה לפני שילוב.

- [Read build information](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_): קוראים את194 לפי מזהה intake ובודקים את זהות המשאב ומספר הבנייה.
- [Read the app information of a build](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_-app): מאמתים בעלות App/bundle של194 וגם של כל בנייה שמתגלה בקבוצות או ברשומות Store; זיכרון מטמון מקומי מונע קריאה כפולה לאותו מזהה.
- [Read the prerelease version](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_-prereleaseversion): דורשים4.58/IOS. [Build beta details](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_-buildbetadetail) מספק את המצבים הפנימי והחיצוני.
- [Beta build localizations](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_-betabuildlocalizations): אוספים את כל העמודים עם locale/whatsNew. חסר/null אינו הופך למחרוזת ריקה; locale כפול נפסל. תוכן ההערות נשמר כפי שהתקבל ללא trim; התאמת hash והערות he נשארת ב־core.
- קבוצות האפליקציה נקראות מ־`GET /v1/apps/{appId}/betaGroups`, ולאחר מכן detail לכל קבוצה ו־[app relationship](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-betagroups-_id_-relationships-app). ארבעת שדות name/isInternalGroup/hasAccessToAllBuilds/publicLinkEnabled נדרשים גם ברשימה וגם ב־detail, ומושווים בין הקריאות.
- [מזהי בניות בקבוצה](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-betagroups-_id_-relationships-builds) ו־[מזהי בודקים בקבוצה](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-betagroups-_id_-relationships-betatesters) נקראים כ־linkage בלבד, ללא אימיילים ושמות.
- קבוצות194 נקראות דרך [List beta groups](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-betagroups) עם שני filters מקובעים `filter[app]` **וגם** `filter[builds]`. אין קריאת אוסף ללא scope, ואין הסתמכות על נתיב GET לא מאומת של `builds/{id}/betaGroups`. משווים מול יחסי הבניות שנקראו מכל קבוצות האפליקציה.
- [Individual tester IDs](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_-relationships-individualtesters) נקראים כ־linkage בלבד.
- [גרסאות Store של האפליקציה](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-apps-_id_-appstoreversions) מסוננות IOS; לכל גרסה קוראים את [הבנייה המשויכת](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-appstoreversions-_id_-build). [יחס Store מהבנייה](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_-relationships-appstoreversion) נבדק בנפרד. null מתקבל רק מ־data:null מפורש; 404 או שגיאת קריאה אינן מומרות ל־null. contract.state משתמש במפורש ב־appStoreState לצורך התאימות ל־core; אין fallback שקט ל־appVersionState.

## שלמות, פרטיות וגבולות

observedAt נרשם בתחילת האיסוף. evidence.startedAt/completedAt מגדירים את חלון הקריאות; זה אינו snapshot אטומי. read budgets קבועים: עד20עמודים/4000רשומות לאוסף, עד2000בקשות ו־20000רשומות מצטברות. אין retry.

לכל next URL נדרשים origin מדויק של Apple, pathname זהה לאוסף המקורי וכל filters/fields/limit המקוריים ללא שינוי. מותר רק cursor נוסף; query כפול, יעד זר, credentials, fragment או הרחבת query נדחים לפני הקריאה. עמוד חוזר, מזהה כפול, total משתנה, עמוד ריק באמצע, קיטוע או אי־התאמת cursor/link מפילים את האיסוף.

[PagingInformation.Paging](https://developer.apple.com/documentation/appstoreconnectapi/paginginformation/paging-data.dictionary) מתעד total ו־limit. Apple מציגה total כשדה אופציונלי; **ה־collector הזה דורש אותו במפורש** כהוכחת שלמות שמרנית, בכל עמוד כולל אוסף ריק. ה־total חייב להתאים לספירה המדויקת בסיום. אם endpoint חי משמיט אותו, השלב ייעצר ויידרש פתרון שלמות מתועד וסקור; אין לדלג על הבקרה.

null של hasAccessToAllBuilds/publicLinkEnabled/usesNonExemptEncryption נשמר כ־null. דגל חסר או מחרוזת false אינם נתון ידוע. policy של owner group, מוכנות VALID והערות מאומתות עדיין נבדקים ב־core; ה־collector אינו מעניק קבלת הפצה.

evidence מכיל מסלולי GET, hashes של הבקשות/מזהי העמודים, counts, total, שלמות ודיווח הנגזרת. cursor גולמי אינו נשמר: שומרים hash בלבד ומסלול ללא cursor. אין raw API bodies, אימיילים, keys או הודעות transport גולמיות בראיות/שגיאות. כשל מחזיר Error עם evidence.complete=false, ללא snapshot חלקי או coverage מוצלח.

## בדיקות והמשך

`collect-owner-snapshot.test.mjs` מייצא `runCollectorControls()`. בהרצת node --test על קובץ הבדיקות נרשם test בשם owner collector שמריץ את65הבקרות ודורש failed===0. אפשר גם לקרוא ל־runCollectorControls במפורש לקבלת דוח מפורט. אין collector CLI או workflow להפעלה. בבדיקות כאן השתמשנו באותם function bodies בתוך closures בזיכרון, עם builtin assert/crypto ו־API מוזרק בלבד; בדיקת ESM syntax של שני הקבצים נעשתה בנפרד. בנוסף test אמיתי של node:test הורץ ב־stdin על אותם גופי פונקציות: test אחד שהפעיל65בקרות, אפס כשל/דילוג. זו אינה הרצת import של קבצים שנשמרו. Root צריך להריץ import/controls עצמאית לאחר החלת ה־patch.

הבקרות כוללות מסלול מלא/משויך, schema מדויק, null, חוסר paging/דגל/notes, עמוד כפול וקיטוע, origin/path/filter זרים, מגבלות עמודים, בנייה זרה ביעד/קבוצה/Store, כשל ללא retry, והיעדר PII/cursor בראיות. אין קריאות Apple או קבלה של API/IPA חי מתוצאות synthetic.

לפני שילוב: סקירת collector והמתאם החי, קבלת מקור/CI, intake194 אמיתי עם buildID/notes/source/package hashes וקישור פורמט הקבלה ל־core. previousBuildId של193 ייקבע מה־intake-postflight/מלאי Apple חי וייקשר מחדש ב־core; אין להשתמש בקבוע הישן98bb כהוכחה. רק אחר כך אפשר לקבל שלב GET נוסף אחרי postflight ולשמור snapshot/evidence בארטיפקט המקורי. השיוך לבעלים הוא שלב מאוחר נפרד; ה־collector אינו מבצע אותו.
