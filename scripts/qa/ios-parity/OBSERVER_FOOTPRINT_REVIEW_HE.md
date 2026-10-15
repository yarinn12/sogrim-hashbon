# הכנה לא פעילה: השפעת ה־observer ב־iOS475

ה־patch מוסיף תזמור אבחון בלבד. לא שונו קובצי מוצר, XCTest, היומן המקורי או native_stall_monitor.py. QA475 נשאר נכשל; אין כאן תיקון מוכח, קבלת Native, חתימה או הרשאת הפצה.

## מקור ובידוד

- אפליקציה: 8b8bfa6da7fc88e7e846c894d26b59120c871468.
- מכשור מקורי: 5115472ada3f5661d4aa81a23d9a38eb6529b44f.
- tree של שניהם: 11c02930f0312b030b90f78d104ded8acfad60f0.
- כלי התזמור החדשים נבדקים ב־checkout שלישי, לפי GITHUB_SHA הבלתי משתנה של ריצתם.
- baseline הוא manifest מתוך ארכיון iOS475 המקורי: artifact12007329912, ריצה38809205491, משימה116678617964, גודל89,424,704, SHA256 1aaa9f8fc53da1577e509e7993a244152f3dbf6b44931bf4d20fdae6f0b8c9eb.
- נבדקים אותם 50 קובצי מקור, 214 נכסי WWW ו־18 קובצי מכשור, מול כל SHA256 המקורי. ארבעה קובצי fixture JS נוספים נארזים על ידי prepare.py המקורי ונבדקים בנפרד. כל public חייב להיות בדיוק218קבצים.
- במחשב הסוקר אין object מקומי של5115472. כל18בתיו אומתו מול8b והארכיון, באותו tree; זו אינה קריאת commit עצמאית של5115472. ה־workflow דורש checkout אמיתי של5115472 ואימות HEAD/tree/בתים לפני הכנה. אין fallback למקור אחר.

## הפעלה חסומה

ה־workflow החדש מיועד לענף codex/ios475-observer-footprint-abba-20261016 בלבד, ללא dispatch. הוא חסום בשתי שכבות: job דורש github.run_number==0, שאינו מספר ריצה אמיתי; משתנה ההפעלה הוא inactive-preparation בעוד שה־helper דורש reviewed-diagnostic-only.

Root צריך להחיל, להריץ בדיקות ולסקור commit/tag בלתי משתנים לפני שינוי שני השומרים בענף החדש. זהו שינוי כלי להפעלת האבחון שכבר הוסמך, ואינו בקשת אישור TestFlight נוספת. אין לדחוף תחילה workflow חסום שיצרוך run1. לאחר הפעלה מאושרת, helper דורש push בענף/נתיב workflow המדויקים, run_number1/attempt1 ומקור כלים40hex; אין rerun.

## ניסוי

job יחיד ב־macos-26 וב־Xcode26.6, ארבעה iPhone16/iOS26.5 חדשים בבעלות הריצה. סדר קבוע A/B/B/A: ב־A מופעל ה־observer המקורי ללא שינוי, עם אותם ארגומנטים; ב־B אינו מופעל observer חיצוני. אין prewarm, אין AX ואין מכשיר חלופי.

npm ci, שתי סוויטות המכשור, build-www.mjs, cap sync, finalize ו־prepare.py הם המקוריים. בנייה unsigned אחת בלבד ב־build-for-testing. כל ארבע הזרועות משתמשות באותם products של אותה בנייה, עם inventory מלא והשוואת כל הבתים לפני ואחרי כל זרוע. SDK/OS/Xcode וזהות המכשיר נשמרים גם הם. ה־UDID ששימש לבנייה מכובה ונמחק לפני הזרוע הראשונה לפי סדר shutdown/30polls/erase/boot/bootstatus המקורי. אין התקנה/launch של האפליקציה לפני XCTest.

פקודת test-without-building, הבדיקות והתקציבים הפנימיים נשארו מקוריים, כולל המתנת35s, תקציב45s של save ומנגנון הרקע. outer job מוגבל195דקות כדי להכיל בנייה שלעד35דקות, ארבעה צעדים שלעד35דקות ועוד20דקות לתיאום ושימור. זה אינו שינוי של deadline פנימי או היתר retry. פקיעת תקציב חיצוני משאירה זרוע חסרה/לא תקפה. ניקוי ב־finally ובצעד always נעשה רק לאחר אימות UDID/name/runtime/type שבבעלות הריצה; לא מאמצים מכשיר לפי שם, לא מוחקים סימולטורים ולא מכבים את כולם. hard cancellation של ה־host עדיין יכולה למנוע ניקוי סופי; ה־receipts שקדמו לה נשמרים ככל ש־GitHub מאפשר.

## ראיות והשוואה

כל פקודה שומרת args, PID, UTC/monotonic start/end, exit/signal ולוג גולמי. stdout/stderr של XCTest ושל observer נכתבים ישירות לקבצים, ללא עיבוד streaming בזמן האתחול. שומרים גם את monitor-report.json המקורי, raw timeout/error, lifecycle של observer, result.xcresult, attachments, צילומי מערכת, כל native-parity JSON/PNG/log, יומנים ומניפסט, גם בכשל. לא מוסיפים רישום ל־main thread.

דוח כל זרוע שומר:
- את כשל XCTest המקורי בנפרד מתקפות ההשוואה.
- את מפות products לפני/אחרי, hashes ו־SDK לפני/אחרי.
- פרטי boot, מכשיר ו־cleanup.
- session וקידומות capture/ACK/PNG תקפות; journal קרוע, ACK חסר, boot לא תקף או observer חסר פוסלים השוואה. ארבע הזרועות נשארות בדוח; אין סינון כשלים או בחירת retry מוצלח.
- ב־A, report מקורי צריך לזהות UDID/bundle/source הנכונים ולכסות מתחילת native startup עד פרסום הסטטוס הראשון. unavailable/sample-timeout בדוח המקורי עדיין מייצג טיפול ON; אין ממנו הוכחה לדגימה תקינה. אין שינוי במכשור המקורי כדי להוסיף זמני sample פנימיים חסרים.
- producer startMs של performance marks, delivery monotonicMs של PerformanceObserver, זמני receipt native ופרסום ראשון מוצגים בנפרד. first-screen-rendered אינו הוכחת paint; home-wait-ready הוא poll ולא זמן frame פיזי ראשון.
- NATIVE_STATUS_MISSING/XCTAssertTrue failed נשאר כשל35s גם אם מופיעים אחריו שמונה צילומים מאוחרים. הופעת ready מאוחרת אינה הופכת את ההמתנה להצלחה.

המסע המלא בגודל רגיל דורש13שלבים וסמן הצלחת XCTest. המאמת האבחוני בודק קידומות מקור/יומן/ACK/PNG ועיתוי, ואינו מריץ או מחליף את prepare.py validate המלא הדורש שני גדלים. nativeAcceptance/sourceAccepted/distributionAllowed נשארים false תמיד.

ABBA על host יחיד הוא אבחון חקרני. ארבע מכונות וירטואליות על אותו host אינן ארבעה hosts עצמאיים, ואין כאן counterbalance בין hosts. אין להציג תוצאה כהוכחת גורם ללא בחינת ראיות והמשך לפי Root.

## בדיקות ומסירה

הקובץ tests/iosObserverFootprint.test.mjs נכלל ב־npm test הרגיל. 15 בדיקות מכסות קשירות, bytes אמיתיים, דחיית SDK/מכשיר זר, סדר וזהויות, פרוטוקול finally בפועל עם שגיאות collection/validation/cleanup, שימור failed prefixes, ACK/PNG חסרים והפרדת שעונים.

בסביבה לקריאה בלבד הורצו13בדיקות סמנטיות בזיכרון ללא fail/skip, syntax לכל3קובצי MJS ו־actionlint עם shellcheck/pyflakes מושבתים. שתי בדיקות הקבצים האמיתיים, הבדיקה ללא התאמות import, qa:architecture והסוויטה המלאה ממתינות ל־Root לאחר החלת ה־patch. אין כאן Swift compilation או ריצת מכשיר.

בנוסף, מאמת הקידומת הופעל בקריאה בלבד מול היומנים/דוח/PNG/monitor המקוריים ב־ZIP475: שמונה שלבים, initialWait=failed, interval של observer תקף. producer auth-ready25521 נפרד מ־delivery37448; first-screen26942; double-rAF producer7876ms לעומת receiptכ־7879ms. העיכוב קיים במקור; הסיבה לא הוכחה.

פקודות Root לאחר החלה ב־checkout נפרד:
    node --test tests/iosObserverFootprint.test.mjs
    npm run qa:architecture
    npm test
    actionlint -shellcheck='' -pyflakes='' .github/workflows/ios475-observer-footprint-abba-20261016.yml

שומרים checkpoint לפני הפעלה. אין ב־patch push, API, keys, signing, upload או שינויי חנות/מסד/Production, ואין הפעלה של automation iphone.

לפני push Root יוודא גם ש־preview לענף האבחון כבוי; ה־patch אינו משנה הגדרות Vercel.
