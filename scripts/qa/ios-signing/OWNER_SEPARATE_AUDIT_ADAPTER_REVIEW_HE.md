# מתאם intake מוצלח ואודיט נפרד — הכנה בלבד

בסיס העבודה הוא `dadddea7b34295bb94f9197136686c80c9688606`. הקבצים החדשים אינם משנים אפליקציה, workflow, את `owner-availability-guard.mjs`, את המתאם הישן או את ה־entry החסום `runOwnerReadOnlyAudit`. אין במודול Python החדש CLI, environment, filesystem, subprocess, transport או credentials. כל קשירות האמת החדשות נשארו PENDING.

## חוזה הבייטים והמקורות

`adapt_separate_audit_to_owner_receipt(files, now_utc=...)` מקבל בדיוק19 ערכי bytes: כל12 קלטי המאמת הקיים `verify_successful_intake.py`, הקבלה המקורית `successful-intake-receipt.json`, שני Git commit records של toolkit/controller האודיט, records של audit run/jobs/artifact ו־`audit-evidence.zip` המקורי. השעון נמסר במפורש. שתי מערכות PINS נבדקות לפני גישה לקלט או לשעון; אין override בזמן ריצה.

המאמת הקיים מופעל מחדש על כל12 הקלטים המקוריים. הפלט חייב להיות זהה **בבייטים** לקבלת ה־intake שנמסרה, בנוסף ל־SHA256 המקובע שלה. כך קבלה נגזרת אינה תחליף לארטיפקט הקליטה המקורי, לבתים של חבריו, לטביעות המקור או למקורות signing/intake. המתאם אינו מפענח IPA ואינו מריץ codesign מחדש.

מקור signing/intake נבדק בידי המאמת המקורי ומוצלב גם ל־repository/owner IDs הנפרדים של האודיט. מקור toolkit האודיט ומקור controller ה־workflow נבדקים בנפרד לפי SHA/tree ו־Git API URLs. אין הנחה ש־run.head_sha הוא toolkit SHA. ה־audit run/job/artifact חייבים להיות נפרדים מ־signing/intake, מאותו repo/head-repo ו־owner, עם event/branch/path/name, numeric IDs, run-number1 וניסיון1 מדויקים. נדרשים run/job/required steps מוצלחים, jobs envelope שלם, ארטיפקט לא פג־תוקף ו־name/size/digest/run/controller שתואמים לבייטים המקוריים.

## ארטיפקט האודיט העתידי

זו הגדרת פורמט **עתידי שטרם נוצר או הופעל**, לא טענה ש־workflow קיים כבר מפיק אותו. מפת `auditMemberSha256` חייבת לקשור סט חברים מלא, לפחות:

- `owner-snapshot.json`, `owner-snapshot-evidence.json`
- `audit-execution-context.json` — הבייטים של תוצר `verifyAuditExecution`
- `audit-controller-commit.json`, `audit-tool-commit.json`
- `audit-context-run.json`, `audit-context-jobs.json` — captures המקוריים בזמן בדיקת ההקשר כשהריצה וה־job עדיין in_progress

נבדקים ZIP מקורי stored/deflate, CRC, local headers, שמות JSON שטוחים, קבצים רגילים, היעדר כפילות/קישור/הצפנה ותקציבי הרחבה. אין קלט חיצוני של snapshot מחולץ שמחליף membership בארכיון. שינוי whitespace בחבר, גם אחרי קשירה מחדש של digest/size החיצוניים, נדחה אם טביעת החבר המקורית לא תואמת.

קבלת ההקשר חייבת לשמר scope של הכנה, policy SHA שנקשר מחוץ למקורות, שני tool/controller origins, source/tree, אותו audit run/job המספרי ו־job key נפרד, attempt/event/path וזמן מקורי. `apiSha256` מוצלב לבתים המקוריים של ארבע תגובות ההקשר בתוך ZIP; שני commit captures זהים גם לקלטים המקוריים החיצוניים. רשומות הריצה וה־job בזמן ההקשר חייבות להוכיח את אותו מקור ומזהה במצב in_progress, והרשומות הסופיות חייבות להוכיח completion/success. `inputSha256` משמר את סט קלטי האודיט הנסקר, ובו לפחות קבלת ה־intake המקורית ו־metadata המקור.

רצף הזמנים: סיום intake מוצלח → יצירת ריצת audit → תחילת job → checkedAt של context → observedAt/תחילת collector → סיום collector → יצירת artifact → סיום job/run → השעון שסופק. `run.updated_at` של capture מוקדם יכול להקדים את תחילת ה־job; הוא אינו משמש זמן השלמת collector. אין reset של timestamps ואין הנחה ש־upload עדיין נכשל אם האודיט המאוחר נכשל.

## baseline והיקף הרשאות

Snapshot מלא וראיות GET/pagination מוצלבים זה לזה: כל אוסף/עמוד/type/count/total/terminal link, hashes, וקריאות המקור הייעודיות. קריאות גלובליות או משנות מצב נדחות. שדות build/app/bundle/IOS4.58/194/VALID, notes בעברית, כל הקבוצות והבניות, היחסים ההפוכים עם הבודקים ורשומות Store נבדקים. נדרשים אפס שיוכי194, בודק הבעלים היחיד בקבוצה הפנימית הידנית הקיימת והיעדר חשיפה חיצונית/פרטנית/Store. קבוצות וגישות build נשמרות בין preflight/postflight intake ובין postflight ל־audit.

כל סט `baselineBuildIds`, ה־SHA256 של JSON הסט הממוין ו־`previousBuildId` מועברים בדיוק לקבלת ה־owner הקנונית ול־return value. baseline ריק דורש קשירה מפורשת של `[]`/hash מתאים/`null`; סט לא ריק דורש previous ID שהוא חבר בסט, וכל מזהה קיים נשמר. אין בחירת193 או GUID היסטורי ואין המצאת baseline. הקבלה תואמת ל־core הקיים; בדיקות האינטגרציה מוכיחות שרק POST של194 לקבוצת הבעלים הקיימת מותר, ו־idempotency אינו מוסיף POST נוסף. אף בקשה אינה מבוצעת.

כמו בחוזה הקודם, preflight intake אינו מוכיח חברות בודקים היסטורית או Store build links שלא תועדו בו. ה־audit מספק את baseline המלא לצעד owner העתידי. לא ממציאים שדות חסרים בדוח intake; שדות Store שנמדדו בו מושווים, וקשרים חדשים שנקראו באודיט נשמרים בבסיס לצעד העתידי.

## גבולות אמון ובדיקות

כל הראיות נקשרות לאחר הורדה מקורית וסקירת Root. עיגון policy/context, אימות hashes של כל קוד ה־runtime לפני import, מדידות namespaces/checkout, מקור responses ו־transport חי נשארים אחריות caller עתידי שנסקר. המתאם הטהור אינו מאמת HTTP provenance בעצמו, אינו מרחיב את `transportAttestation`, ואינו מחליף קריאת מקור/CI חיה לכל4 הריצות/18 התפקידים. אין claim של Apple audit אמיתי, חתימה עצמאית, זמינות לבעלים, מסד או Production. כל acceptance/distribution flags נשארים false. לפני owner action עדיין נדרשים snapshot חי טרי, serialization ו־postflight כפי שמגדיר ה־core.

בדיקות `test_owner_separate_audit_adapter.py` משתמשות רק במקורות ומזהים סינתטיים. הן כוללות origins נפרדים, hashes ובתים מקוריים, tamper גם לאחר קשירה סינתטית מחדש, scope/chronology, empty/nonempty baseline, ZIP/CRC/pagination ותאימות אמיתית ל־core ב־Node. הבדיקות הרגילות כוללות אותן באמצעות `tests/iosSeparateAuditAdapter.test.mjs`; ב־Windows ניתן להצביע על Python מותקן באמצעות `SOGRIM_TEST_PYTHON` לצורכי הבדיקה בלבד.

מקרה OLD/FINAL משותף: אותם ארטיפקטים סינתטיים מכילים intake מוצלח ללא collector step ו־audit מוצלח נפרד לאחריו. OLD הוא המתאם השמור בבסיס dadd, עם binding סינתטי בזיכרון בלבד ו־17 הקלטים המוצהרים שלו מתוך אותן ראיות. הוא נכשל על `collector.length === 1` ב־intake. FINAL מקבל את19 הקלטים המקוריים ומחזיר receipt חסום להמשך סקירה. זו אותה עדות תפקודית; צורות ה־API של שתי הגרסאות שונות במפורש. אין OLD mode במודול הנשמר.

יש לשמור את כל הכשלים בסוויטה הפרטית ולדווח אותם; אין טענה ל־full private green. שילוב פעיל עתידי דורש audit אמיתי, המקורות והארטיפקטים שקובלו, קיבוע כל ה־PENDING, סקירת חיווט וקריאה חוזרת של commit חדש. אין להחליף את ה־entry החסום ב־helper זה לפני השלמתם.
