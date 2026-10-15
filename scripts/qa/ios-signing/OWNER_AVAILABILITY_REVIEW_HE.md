# הכנת זמינות TestFlight לבעלים הקיים — scaffold בלבד

הוכנו שני קובצי קוד ובדיקות מבודדים, בהסתמך על חוזי ה־intake של commit `99108f94df459f0814b875faaf826d90b425b26d`. לא נערך קובץ ב־Root ולא שונה public/database guard. אין כאן workflow, CLI, client, `fetch`, מפתחות, פנייה ל־Apple, build, חתימה, upload, push או שינוי בחנות.

הספרייה מתכננת רק את הבקשה הבאה, ומאמתת בקשה נתונה מול התכנון:
`POST /v1/betaGroups/4646e3de-7401-4e70-ac32-9a00072e1376/relationships/builds`
עם build יחיד שייקבע ב־handoff. היא אינה מבצעת את הבקשה. App6809952514, bundle com.sogrimhashbon.app, גרסה4.58/build194, הקבוצה והבודק הקיימים מקובעים. כל source/tree/tool/run/job/artifact/digest/buildID האמיתיים חסומים ב־PENDING. גם digest קבלת intake המקורית והערות he עדיין PENDING.

הבדיקה דורשת קבלה מקורית לפי SHA256 עם חבילת intake בלבד, אותה חבילה/מקור/הערות, ו־snapshot מלא ללא שיוכים. לפני הפעולה היא דורשת snapshot טרי: VALID, לא expired, הצהרת הצפנה קיימת, הערות he זהות, קבוצה פנימית קיימת וידנית, בודק יחיד קיים, שימור כל סט הבניות המקובע, אפס individual testers, אפס Store association ואפס שיוך194 לקבוצות. קבוצה חיצונית מזוהה חייבת public link כבוי; null של hasAccessToAllBuilds החיצוני נשמר כ־null. יחסי build↔groups ו־testers↔groups נבדקים בשני הכיוונים.

## baseline מלא או ריק שנקשר לאחר אודיט

`baselineBuildIds`, ה־SHA256 של JSON הסט הממוין, ו־`previousBuildId` נשארים PENDING בקוד הנשמר. המתאם חייב להצליב את הסט המלא בין קבלות preflight/postflight ובין snapshot מלא וראיות pagination. אותם שלושה שדות נכללים גם בבייטים הקנוניים של קבלת intake שנקשרת ל־core לפי digest.

baseline ריק מותר רק בקשירה מפורשת של `[]`, ה־hash המתאים ו־`previousBuildId: null`, לאחר סקירת אודיט אמיתי. אין fallback לריק, ואין בחירת GUID היסטורי או מספר בנייה משוער. בסט שאינו ריק, previousBuildId חייב להיות חבר בסט; אין די בשימור אותו מזהה יחיד. לפני ואחרי הפעולה כל מזהה baseline קיים חייב להישאר, ומותר להוסיף רק את194 שנקשר לקבלה. ה־entry וה־workflows נשארים חסומים וללא שינוי.

לאחר הפעולה חייב להיות IN_BETA_TESTING עם הקבוצה והבודק המורשים בלבד. כל יתר המידע ב־snapshot נשאר זהה, כולל קבוצות, חברויות בודקים, גישה לבניות ישנות, הערות, external state ורשומות/שיוכי Store. אם הזמינות כבר נכונה, התכנון הוא ALREADY_AVAILABLE עם request=null; מאמת הבקשה דוחה POST נוסף. חשיפה לא צפויה גורמת כשל. הוכחת הסיום מחזירה source/tree/version/build/buildID/IPAhash ו־databaseAccepted/publicReleaseAccepted=false.

## תנאים לשילוב עתידי

זהו core טהור עם חוזה snapshot/receipt חדש, לא מתאם API מוכן. יש להתאים במפורש את הפורמט לקבלות991/ה־intake הסופי ולסקור את המתאם, בלי להמציא קבלה או לשנות שערי public/database. שדה coverage הוא הצהרת המתאם; הוא אינו מוכיח בעצמו קריאות HTTP או השלמת pagination. נדרש collector חי שיתעד כל עמוד, דגל ויחס וישווה מקור מדויק. רשימת testers בחוזה היא איחוד החברים בכל קבוצות האפליקציה; אין כאן טענה לסקירת בודקים גלובלית בחשבון Apple.

Root יקבע מקור ומספר סופיים, intake חתום/נקלט אמיתי ו־receipt bytes/hash; לאחר מכן יקשור את כל PENDING ויקבל סקירה חדשה. אין לשחזר דרך קוד זה חבילת194 או193. בדיקות synthetic מחליפות PINS רק במודול data URL בזיכרון לצורך הבקרה; הקובץ הנשמר נשאר PENDING.

לפני פעולה אמיתית צריך קריאה חיה נוספת סמוכה ל־POST, serialization בין הרצות ותיעוד append-only. תכנון טהור אינו reservation אטומי ואינו מונע שני תהליכים להשתמש ב־snapshot ישן. אין retry אוטומטי לאחר POST עמום: שומרים את הכשל וקוראים מצב חי; משויכת נכון משמעה no-op, חשיפה או מצב לא ברור משמעם עצירה. נדרש postflight חי גם כאשר השרת החזיר success; אין להסיק זמינות מספקת מ־204 בלבד. עד שהמתאם והקשירה נקראים בחזרה ומתקבלים, אין מסלול הפעלה.

## בדיקות וגבולות

הרצת `node --test owner-availability-guard.test.mjs` בודקת מסלול תקין, idempotency, notes/identity/binding, שלמות אוספים, דגלים, שימור הסט המלא, חשיפה חיצונית/פרטנית/Store, שינויים בקבוצות ובודקים, ו־mutations של הבקשה. `tests/iosOwnerBaselineBinding.test.mjs` כולל גם את בדיקות המתאם בסוויטה הרגילה. שחזור OLD עם baseline ריק סינתטי נכשל על דרישת הגישה הקודמת; FINAL מקבל רק את הוספת194 ודוחה סט/קבוצה/בודקים/Store שלא נקשרו. הפעלה של הקובץ הלא קשור נחסמת לפני צריכת input. הבדיקות אינן פונות ל־Apple ואינן קבלת IPA/מסד/שדרוג/Production/מכשיר פיזי.

תיעוד Apple לפעולת הקשר: [Add builds to a beta group](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betagroups-_id_-relationships-builds). [Beta Groups](https://developer.apple.com/documentation/appstoreconnectapi/beta-groups) מתעד שקבוצה מעניקה לחבריה גישה לבניות המשויכות. אין כאן הוספת בודק או שליחת הזמנה.
