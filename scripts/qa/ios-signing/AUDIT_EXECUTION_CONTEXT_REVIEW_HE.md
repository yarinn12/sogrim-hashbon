# מקור ריצת האודיט הנפרד — מודל הכנה טהור וחסום

בסיס הקריאה: c91f91e075a037b842a7200ed5847baac0d83fb8 / tree0a9aa9085bb815801d84b705368896904130c554. הקבצים החדשים אינם משנים את חסם runOwnerReadOnlyAudit או קובץ קיים אחר. אין workflow, CLI, fetch, קריאת environment, filesystem או מפתחות במודול החדש. לא בוצע push או שינוי אוטומציה.

## פתרון הקשירה בלי מעגל עצמי

המאמת אינו מכיל auditRun/auditJob מקובעים מראש. context הריצה המהימן מתקבל כש־GitHub מתחיל את הריצה, ומוצלב מול records מקוריים של GitHub API. מזהה ה־job המספרי נגזר רק מ־jobs[].id לאחר בחירה יחידה בשם job שהקשר שלו ל־job key נסקר מראש. github.job/GITHUB_JOB הוא key כמו owner_audit, ואינו מזהה מספרי.

מקור הכלים ו־workflow אינם יכולים להכיל את SHA העצמי שלהם לאחר העריכה. המודל משתמש בשלושה רכיבים:
1. toolkit immutable עם collector/client/verifier והקבצים הקריטיים.
2. controller immutable המכיל את ה־workflow וה־launcher הנסקרים.
3. חוזה סקירה חיצוני לשני המקורות, שנוצר רק אחרי שמקוריהם ותכניהם קובעו. הוא מכיל את SHA/tree ושמות המרחבים ואת hashes הקבצים והקלטים. ה־digest של חוזה הסקירה אינו נמצא בתוך החוזה עצמו, וגם מזהי ריצת האודיט אינם בו.

ה־caller המהימן העתידי מוסר את policyBytes ואת policySha256 שנאמת ממסירת Root חיצונית. אסור להפיק anchor זה מתוך אותו JSON, מתוך event.inputs, ממחרוזת environment שניתנת לשליטת dispatcher, או על ידי חישוב hash של כל קלט שהתקבל. אם אין מקור אמון חיצוני מוכח ל־anchor ול־context, אין אפשרות להפעיל את המודל כשער. המאמת הטהור אינו מסוגל לאמת בעצמו מי מסר את הארגומנטים שלו.

לא מומש כאן מנגנון הפצת החוזה/ה־anchor. בפרט אין להטמיע את החוזה מחדש בתוך toolkit/controller המתוארים בו ולחזור על מעגל ה־SHA. בחירת מנגנון מסירה מהימן, אימותו ושילובו ב־launcher נשארים חלק מסקירת Root לפני הפעלה. זו מגבלת אינטגרציה מפורשת ולא callback שמעניק הרשאה.

כל הקשירות האמיתיות ב־AUDIT_EXECUTION_POLICY_TEMPLATE נשארו PENDING. הוא immutable. חוזה שנשאר PENDING נדחה לפני כל גישה ל־trusted runtime או לראיות. החוזה דוחה שדות auditRun/auditJob/policySha256: הם אינם קשירות שאפשר להמציא מראש.

## מה המאמת מצליב

verifyAuditExecution(reviewed, trusted, evidence) הוא helper טהור. הוא דורש allowlist מצומצם של built-in GitHub context, לא toJSON(github) מלא שעלול לכלול token/event. שמות שדות ה־allowlist מופיעים בקוד; IDs ומספרי attempt/run נמסרים כמחרוזות ממדידת ה־caller המהימן.

המודל דורש repo ו־repository/owner IDs נסקרים, מקור workflow ו־head SHA מדויקים, branch/ref/ref_type/workflow_ref/path/event מדויקים, attempt1/run-number1, ו־run ID דינמי חיובי השונה מ־intake/signing. controller וכלי הקריאה יכולים להיות commits שונים; אין להציג את run.head_sha כ־toolkit SHA אם ה־workflow שייך ל־controller.

ארבע תגובות API מקוריות נדרשות ב־Buffers: git commit של controller ושל toolkit, actions run הנוכחי, ו־attempt1 jobs. לכל capture נדרש URL מדויק מאותו repo, GET/redirect:error ללא body או headers שמורים, וחלון זמנים מקורי בתוך בדיקת ההקשר. Git commit/tree ו־URLs מוצלבים עם החוזה; run חייב in_progress/conclusion=null, ו־repo/head-repository/head/path/event/run/attempt/run-number חייבים להתאים ל־context. רשומת run שהושלמה אינה תחליף להוכחת ריצה נוכחית לפני keys.

jobs envelope חייב להיות שלם, עד100 jobs, עם IDs מספריים ייחודיים ומקור/run/attempt מדויקים. total_count גדול ממספר הרשומות חוסם; לא נטען שהתקבלה pagination מלאה כשיש עמודים חסרים. נדרשת בדיוק התאמה אחת לשם ה־job הנסקר, והיא חייבת להיות in_progress. ID נלקח ממנה ומוצלב ל־job.url/run_url. אין fallback ל־GITHUB_JOB או למזהה שהומצא.

המודל מיועד ל־workflow עצמאי עם מיפוי job key ↔ job name יחיד שנסקר, ללא matrix או reusable-workflow שמערבבים זהויות. הוא אינו parser של YAML ואינו מוכיח בעצמו שמיפוי זה נכון. Root חייב לסקור את ה־workflow וה־launcher ולכלול את כל קובצי ה־runtime שלהם במפה הנסקרת; שימוש במטריצה או workflow reusable מחייב סקירת חוזה אחרת.

## checkout ו־inputs

שני namespaces נפרדים וקבועים: audit-controller ו־audit-tools בתוך workspace אמיתי של runner macOS/Linux. ה־caller העתידי חייב למדוד realpath של ה־workspace, git top-level/HEAD/tree, ו־git status --porcelain עם untracked-files=all. עליו לקרוא את הבתים המקוריים ולמדוד realpath ו־regular-file לכל קובץ, תוך מניעת מרוץ בין בדיקה לשימוש. המודול אינו מריץ פקודות אלה ואינו מתיימר להפוך הצהרת JSON חופשית למדידת checkout.

נבדקים מרחב, realPath/gitTopLevel, HEAD/tree מול API והחוזה, checkout נקי, חלון מדידה, סט קבצים מדויק וכל hash. נתיב יחסי לא תקין, חפיפת namespaces, קובץ לא רגיל או realpath זר נדחים. collector, client, חסם האודיט, helper זה ו־verify_successful_intake.py הם pins מחייבים ב־toolkit. workflow וקובצי ה־launcher מחויבים ב־controller.

ה־caller הנסקר חייב לאמת hashes של כלי ההכנה לפני import שלהם; helper שנמצא באותו toolkit אינו יכול לאמת את אמינות ה־import של עצמו בדיעבד. אין לקרוא Apple keys בזמן המדידות או בזמן imports מוקדמים. זו אחריות אינטגרציה נפרדת שנשארה חסומה.

כל inputs נקשרים ב־hash מקורי בחוזה החיצוני, לפחות successful-intake-receipt.json ו־source-metadata.json. ה־receipt מוצלב למקור/tree/ענף, App/bundle/IOS4.58/194/BuildID/IPA ול־intake/signing runs. זהו קישור של תוצר המאמת הקודם, **לא תחליף להפעלת verify_successful_intake ולא לאימות חי של ארבע ריצות המקור וכל18 תפקידי ה־QA ו־Native המדויקים**.

## תוצר ובדיקות

ה־helper מחזיר provenance קפוא עם מזהי run/job המספריים שנמצאו, שני מקורות הכלים, טביעות records וקלטים והזמן המקורי. scope נשאר AUDIT_EXECUTION_CONTEXT_PREPARATION_ONLY; appleKeysAuthorized/ownerAvailabilityAccepted/databaseAccepted/publicReleaseAccepted/distributionAllowed נשארים false. transportAttestation נשאר NOT_PROVIDED_BY_PURE_VERIFIER. אין קבלת הפצה, זמינות לבעלים או הוכחת network-origin עצמאית.

100 בקרות Node סינתטיות עברו בזיכרון, ללא skip/retry. בין השאר: PENDING לפני קריאת dependencies, job key שונה במפורש מה־ID, IDs עתידיים שונים ללא שינוי בחוזה הסקירה, SHA נפרד של workflow, repo/fork/path/event/attempt/run-number, jobs חסרים/כפולים/עמומים, מרחבים ו־realpaths, hashes ו־inputs, חלונות זמנים ו־false gates.

בקרת OLD/FINAL זהה אחת: OLD נכשל1/1 ו־FINAL עבר1/1. OLD הוא עותק מבוקר של helper זה שממנו הוסר רק check של github.workflow_sha; הוא מקבל חיבור שגוי בין context ל־workflow גם כאשר head SHA נראה מתאים. זה אינו commit או workflow production היסטורי. אין מצב OLD בממשק runtime. הבדיקות משתמשות במזהים ובקבצים סינתטיים במוצהר.

ה־test file משתמש ב־readFileSync רק לקריאת מקור המודול השמור לצורך בדיקות. כאן הוזרק אותו source ב־stdin ולא נשמרו קבצים. Root יכול לשמור את שלושת הקבצים בענף מבודד ולהריץ node --test scripts/qa/ios-signing/audit-execution-context.test.mjs. נדרשת קריאה חזרה של commit חדש בנפרד.

## מה עדיין חוסם הפעלה

runOwnerReadOnlyAudit נשאר זהה לבסיס c91:9458 bytes ו־SHA2560444c02082372f1889a41d1669cb710ab2a11cac5e333db3469e4e756975cc89. AUDIT_PINS הישן עדיין מכיל auditRun/auditJob PENDING; אין למלא אותם בניחוש או להסיר את החסם משום שה־helper עבר בדיקות. אינטגרציה עתידית צריכה להשתמש בנתוני runtime מאומתים ככאלה, תוך שמירת pins של מקורות וכלים, ולא להעמיד פנים שמזהי הריצה היו ידועים בעת כתיבת המקור.

נדרשים intake אמיתי מוצלח וארטיפקטיו, הפעלת המאמת המוצלח, קבלת מקור/CI חיה, חוזה סקירה חיצוני עם anchor מהימן, controller ו־toolkit שנקראו בחזרה, מדידות runner/transport אמיתיות וסקירת Root של האינטגרציה לפני טעינת keys. כאן לא יושמו או בוצעו תנאים אלה. האודיט יישאר run/job/artifact נפרדים אחרי intake; כשל בו אינו משנה upload success ואינו יוצר rebuild/re-upload או שיוך לבודקים.
