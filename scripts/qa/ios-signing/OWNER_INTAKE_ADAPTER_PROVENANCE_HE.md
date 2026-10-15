# מתאם intake → owner receipt — הכנה בלבד

Root שמר את שלושת הקבצים בענף מקומי מבודד מבסיס79ff ואימת את patch המקור בטביעת aaa0b2aef5f80637b3858c946928f69f70f78669077a25c3f6f73ec1f7ade616. בקריאה עצמאית לא נמצא חוסם כהכנה בלבד; אין בכך אישור הפעלה. core/collector/adapter עברו יחד99 מקרי node:test חיצוניים (בתוכם בקרות collector ומתאם סינתטיות). החלטת החיבור העתידית היא audit קריאה נפרד אחרי intake מוצלח, ולא הוספת collector כתנאי הצלחה לאחר upload באותו job. לכן דרישת collectorStepName הנוכחית ב־intakeJob היא חסם חיבור מתועד שיש להתאים למקור audit נפרד ולסקור לפני הפעלה.

המתאם נכתב כ־patch בזיכרון, בנפרד מהקבצים המשותפים. בסיסי הפורמטים שנמסרו על ידי Root הם intake `8db1670` ו־owner `79ff461`; קריאת ה־worktrees היא קריאת קבצים, לא אימות Git עצמאי של אותם commits. אין שינוי בקובצי5d/8db/79ff, ואין CLI, workflow, fetch, keys, Apple calls, push, כתיבה או שינוי אוטומציה.

## מה אומת במקור המקומי

נקראו המפיקים בפועל: `intake194-package-origin.mjs`, `intake-origin-guard.mjs`, `intake-source-guard.mjs`, `intake-distribution-guard.mjs`, `intake-workflow-template.yml`, `load-release-notes.mjs`, `verify-original-archive.py`, `protect-artifact.mjs`, `complete-ios-testflight.mjs`, ותוצאת `completeTestFlightRelease`. נקראו גם metadata של האפליקציה, owner core והחוזה של collector.

הפורמטים הבאים חשובים: upload-origin מתעד מקור/tool/signingRun/artifactId/digest/IPA, אך אינו מתעד signingJob או size. מקור הקליטה before-upload מתעד את workflowCommit ו־buildRunId של **הקליטה**, לא של החתימה. postflight מצמצם את build ל־id/build/version/VALID; אין להסיק ממנו expired/encryption או bundle. completion מוכיח app/version/build/BuildID/VALID והערות he; הוא אינו מזהה ארטיפקט GitHub. collector מספק את המידע החסר על app/build/קבוצות/בודקים/notes/Store, והראיות שלו נפרדות מ־snapshot.

המתאם מחזיר receiptBytes קנוניים, receiptSha256, full baselineBuildIds/hash, previousBuildId שנקשר בנפרד לאחר סקירת baseline, וטביעות קובצי הקלט. ה־receipt הוא **תוצר נגזר חדש** המחבר את הראיות; הוא אינו קובץ intake-postflight המקורי. schemaVersion הוא גרסת codec, scope מועתק מ־postflight אחרי בדיקה, ו־hebrewReleaseNotesVerified מועתק מ־completion רק אחרי הצלבת הטקסט. המתאם אינו מעניק קבלת מסד, Production או הפצה.

## טבלת מקור שדה

| שדה בחוזה owner | מקור בפורמט האמיתי ובדיקות הצלבה |
|---|---|
| schemaVersion | גרסת פורמט1 של המתאם; אינה קבלת שחרור |
| scope | intake-postflight.scope; חייב PACKAGE_INTAKE_ONLY וגם upload-origin.scope זהה |
| appId | completion.appId + postflight.appId + snapshot.app.id, מול App6809952514 הקבוע |
| bundleId | metadata.app.bundleId + snapshot.app.bundleId, מול bundle הקבוע |
| version/build | metadata.version.number/build, completion.version/build, postflight.build.version/build ו־snapshot.build.version/build;4.58/194 |
| buildId | completion.buildId + postflight.build.id + snapshot.build.id + binding מאומת עתידי |
| sourceSha/sourceTree | upload-origin, original-artifact-before-upload ו־source-before-upload; source CI חייב אותו מקור וניסיון1 |
| signingToolSha | origin.signingTools מול signing-run.head_sha, jobs.head_sha ו־artifact.workflow_run.head_sha |
| signedRunId | origin.signingRunId מול run.id, jobs.run_id, artifact.workflow_run.id ו־original.originalSigningRunId |
| signedJobId | job חתימה יחיד מוצלח ב־signing-jobs, עם id/name/run/head מדויקים; **אינו** קיים ב־upload-origin |
| signedArtifactId | origin.artifactId מול signing-artifact.id ו־binding |
| signedArtifactSize | signing-artifact.size_in_bytes מול אורך ה־ZIP המקורי ו־binding |
| signedZipSha256 | origin.artifactDigest + artifact.digest מול SHA256 של bytes ה־ZIP המקורי |
| ipaSha256 | origin.ipaSha256 + original-artifact-before-upload.ipaSha256 + binding; המתאם אינו פותח או מפענח IPA |
| intakeToolSha | source-before-upload.workflowCommit מול intake-run.head_sha, jobs.head_sha ו־artifact.workflow_run.head_sha |
| intakeRunId | source-before-upload.buildRunId מול run.id, jobs.run_id ו־artifact.workflow_run.id |
| intakeJobId | job הקליטה המוצלח מתוך intake-jobs, עם binding/name; נדרשת גם הוכחת step של collector שהושלם |
| intakeArtifactId | intake-artifact.id מקריאת GitHub שנלכדה **אחרי** יצירת הארטיפקט; אינו בדוח postflight |
| intakeZipSha256 | intake-artifact.digest מול bytes ZIP הקליטה המקורי ו־binding |
| notesSha256 | SHA256 של metadata.version.releaseNotes.trim(), בדיוק כהתנהגות loader, מול טקסט he שנקרא ב־snapshot; ללא trim של readback Apple |
| hebrewReleaseNotesVerified | completion.flag===true **וגם** התאמה מלאה של notes/source metadata |
| snapshot | bytes מקוריים של collector, מוצלבים עם postflight, עם קבוצות/בניות/בודקים/Store/notes שלמים |
| ownerCore.intakeReceiptSha256 | hash של **תוצר המתאם הקנוני**, שנקשר ב־core רק בשלב סקירה מאוחר; אינו ZIP hash או hash של postflight |
| ownerCore.previousBuildId / full baseline set | אינו נגזר מגרסה193 ואינו נלקח מ־10837 ההיסטורי. דרוש baseline חי וסקירת חוזה; ראו למטה |

מקור metadata מוכח גם מול source-before-upload.sourceInputs בנתיב `docs/store-submission/app-store-metadata-he.json`, תוך בדיקת package/package-lock ו־sourceInputs מלא. כל ארבע קבלות ה־CI נדרשות, וכל job בהן מוצלח מאותו מקור, לרבות נתיבי Native וה־lanes הנדרשים בפורמט8db.

## חסימות וקלטים שעדיין אינם קיימים

ADAPTER_PINS וכל SHA256 של קובץ קלט, SHA/tree/tool, IDs של run/job/artifact/build194, גדלים, notes digest, baseline digest והבחירה ל־legacy previousBuildId נשארים PENDING. requireAdapterBindings מופעל **לפני** כל גישה לאובייקט הקלט. אין פרמטר runtime שעוקף את הקשירה.

הקלטים הנדרשים הם17 buffers מקוריים: metadata, upload-origin, source-before-upload, original-artifact-before-upload, intake-preflight/postflight, completion, collector snapshot/evidence, שישה records של GitHub ל־run/jobs/artifact של החתימה והקליטה, ושני ZIPים מקוריים. כל קובץ חייב להתאים ל־SHA256 שהוקפא לאחר handoff וסקירה. חוסר בקובץ או field אינו מוחלף בערך משוער.

ב־8db אין עדיין שלב שמפיק ושומר snapshot/evidence של collector. נתוני GitHub של job/artifact אינם קיימים בדוחות הקליטה עצמם. בפרט, אי אפשר להטמיע בתוך ZIP את ה־digest של אותו ZIP בלי מעגל עצמי; נדרשת קריאת artifact חיצונית אחרי יצירתו. המתאם אינו מבצע אותה.

ב־intake-jobs נדרש step מוצלח בשם מדויק שיוקפא בשלב החיבור. הוא אינו קיים במסלול המשותף כעת. אין אפשרות להפיק receipt קביל מהדוחות הנוכחיים לבדם. גם קבועי המקור והחבילה הישנים בכלים האחרים אינם מקור לאישור כאן; כל כלי נשאר לא פעיל עד קבלת מקור וקשירה מפורשות.

## פער baseline בחוזה79ff

ה־owner core הנוכחי עדיין מכיל previousBuildId היסטורי של10837. אין ראיה חיה שהקבוצה מכילה אותו או שהבנייה הקודמת היא193. **אין דרישה להחזיר193 לקבוצה, ואין helper שעושה זאת.**

המתאם משווה את כל מזהי הבניות בקבוצת הבעלים בין preflight/postflight לבין collector, ומשמר את הסט המלא. בחירה ל־legacy previousBuildId מותרת רק לאחר baseline חי וסקירת Root, חייבת להיות חברה באותו סט מאומת, ואינה נבחרת אוטומטית לפי מספר גרסה. גם full-set digest נשאר PENDING עד אז. הקובץ אינו משנה את ה־core המשותף.

אם baseline אמיתי ריק, החוזה הנוכחי עם previousBuildId יחיד אינו מתאים: המתאם יישאר חסום ודרושה סקירת חוזה נפרדת. אין ליצור שיוך כלשהו כדי להשביע בדיקה. בדיקת happy path סינתטית משתמשת בסט שמספריו188/190, **ללא193**, ומוכיחה שאין תלות בגרסה או ב־GUID ההיסטורי.

מזהי הבודקים לפני intake אינם חלק מפורמט preflight8db; המתאם אינו ממציא הוכחה היסטורית לחברותם. ה־baseline המלא לצעד owner העתידי הוא collector שלאחר intake. שימור הסט והגישות בצעד העתידי ייבדק מול baseline זה. גם Store build links לפני intake אינם בדוח הישן; רק states נבדקו שם. ה־collector מספק baseline אמיתי של הקשרים לצעד owner העתידי.

## ראיות collector וגבולות אמון

המתאם מצלב collection types/IDs/counts/totals/terminal pages מול ה־snapshot, מקשר כל עמוד ל־GET מוקלט יחיד, מאמת את שרשרת העמודים ואת כל הקריאות הייעודיות הנדרשות, ודוחה מסלול/מקור זר, אוסף חסר, קריאה גלובלית או POST בראיות. הוא אינו ממציא total; total חסר חוסם. timestamps אינם מתעדכנים לזמן המתאם; collector חייב להתחיל אחרי completion/postflight.

ראיות collector עדיין נושאות transportAttestation=NOT_PROVIDED_BY_THIS_COLLECTOR. boolean coverage והקבלות האלה אינם הוכחת רשת עצמאית. אמון במקור הייצור מחייב tool commit בלתי משתנה שנבדק, job/step שהושלם ו־transport חי שנסקר אצל Root. בדיקות synthetic אינן כאלה.

המתאם מאמת ZIP bytes לפי digest/size וטביעות קבצים מחולצים לפי pin נפרד. הוא **אינו parser של ZIP ואינו מוכיח בעצמו membership בתוך הארכיון**. בשלב handoff Root חייב לאמת את הורדת ה־ZIP ואת החילוץ, ולהקפיא את טביעות הקבצים שנקראו ממנו. אין להשתמש בטביעות אקראיות שנמסרו בזמן ריצה. חתימה/פרופיל/נכסים נשענים על דוח macOS המקורי שנקשר בבייטים; אין כאן codesign חדש או קבלת חתימה עצמאית.

## בדיקות והעברה לסקירה

הוכנו62 בקרות: PENDING לפני צריכת input, happy path קנוני דטרמיניסטי, התאמה ל־core עם bindings סינתטיים, שינויי bytes, mismatch בין מקורות גם לאחר קשירת hashes סינתטית מחדש, קבצים ושדות חסרים, source/CI/job/artifact, notes, baseline מלא, קבוצה ריקה, חשיפה לא צפויה, collector pages וקישורים, paths זרים ו־JSON שאינו ניתן לסריאליזציה ללא אובדן.

62/62 עברו בזיכרון על גופי הפונקציות המדויקים, עם factories המחליפים bindings **לצורך הבדיקה בלבד**; קוד ההכנה נשאר PENDING. ESM syntax נבדק בנפרד. לא הורץ import של קבצים חדשים שנשמרו, משום שלא נכתבו קבצים. ה־test file מפעיל את אותו harness ב־node:test לאחר החלת patch; Root צריך להריץ אותו עצמאית בסביבה המבודדת.

רק לאחר מקור סופי/CI/Native, חתימה ו־intake אמיתיים, collector חי וסקירת baseline/חוזה, ניתן לקשור את המתאם, להפיק את התוצר ולסקור אותו. רק לאחר מכן ניתן לקשור במפורש את hash התוצר ואת baseline ב־owner core בלתי משתנה. אין במסלול הכנה זה הפצה, שינוי גישה, אישור Production או שינוי אוטומציה.


## קבלת Root המקומית

הסוויטה הפרטית הסתיימה עם3,637 הצלחות ושני כשלים מתוך3,639, ללא דילוגים. שני הכשלים זהים לבסיס79ff: חוזי מסלול ההעלאה הציבורי ובנייה193 הוחלפו בכלי ההכנה הפרטיים בחתימה בלבד ובנייה194. הם לא הוחלשו ולא הוסתרו, ואין טענה שהסוויטה הפרטית ירוקה. הבדיקה בכלי הארכיטקטורה מהמקור הנוכחי מצאה שתי תלויות ישנות באפליקציה שבבסיס ההכנה; src לא שונה במתאם. מקור האפליקציה הנמסר נבדק בנפרד ואינו נבנה מ־src הפרטי הזה.99 בקרות core/collector/adapter עברו מקומית. סקירת QA נסגרה ללא חסם כהכנה בלבד. כל הקשירות נשארות PENDING, ואין מסלול הפעלה.
