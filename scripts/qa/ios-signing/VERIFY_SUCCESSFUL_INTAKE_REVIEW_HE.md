# מאמת intake מוצלח — הכנה טהורה וחסומה

הקשר הסקירה: `c831846cdc5d567b8687865388a947129a53894d`, tree `6e7b262561d79e4cf5c0e7c8dbbbd6d2a75f440e`. זה מקור כלי ההכנה שנקרא, ולא מקור אפליקציה שהתקבל. שלושת הקבצים החדשים אינם משנים את `runOwnerReadOnlyAudit`, את ה־collector/adapter, את השומרים הציבוריים או workflow כלשהו. אין CLI, קבצים, רשת, environment או credentials במודול המאמת. אין הפעלה, חתימה או upload.

## הממשק

`verify_successful_intake(files, *, now_utc)` מקבל בדיוק12 ערכי bytes מקוריים. הוא בודק את PINS לפני כל גישה לקלט או לשעון. PINS הם immutable במודול; אין factory או override ציבורי. כל קשירה אמיתית נשארה PENDING.

קלטי GitHub חיצוניים: Git commit API של מקור האפליקציה ושני הכלים; run/jobs/artifact של signing ושל intake. בנוסף נדרשים metadata bytes מהמקור, ZIP החתימה המקורי המוצפן ו־ZIP ראיות הקליטה המקורי. רשימת INPUT_FILES במודול היא החוזה המדויק. טביעת כל קלט נקשרת במקור כלים חדש לאחר handoff וסקירה; metadata של artifact נלכד אחרי יצירתו, מחוץ ל־ZIP שהוא מתאר, כדי להימנע מתלות מעגלית.

המאמת מצלב repo ו־fork, tool SHA/tree, ענף/path/event, run/job/run-number, ניסיון1, מצב success, השלמת כל ה־jobs וה־steps שחייבים להיות קשורים בשמות המדויקים. API jobs envelope חייב להיות שלם עם IDs ייחודיים; אין הנחה ש־GITHUB_JOB הוא ID מספרי. artifact מוצלב ל־run/tool, ID/name/size/digest, תאריך יצירה ותוקף ביחס ל־now_utc המפורש. ה־clock חייב להגיע מאינטגרציה מהימנה עתידית; הוא אינו הופך את הרשומות הישנות לקריאה חיה.

## חברות ובתים בארכיון

ZIP הקליטה נקרא ישירות מ־BytesIO בעזרת zipfile של Python, בלי חילוץ לדיסק. גם bytes חיצוניים של JSON מחולץ אינם מתקבלים במקום ZIP. נדרש סט חברים מלא וזהה ל־memberSha256 שנקשר לאחר סקירת הארכיון האמיתי; לפחות שבעת הקבצים שמפיק scaffold הקליטה נדרשים. תוספת אמיתית מחייבת קשירת hash מפורשת.

כל חבר חייב להיות JSON שטוח בשם ASCII, קובץ רגיל, ללא כפילות/נתיב/קישור/הצפנת ZIP; נתמכים stored ו־deflate בלבד. CRC, header/overlap ובתים נבדקים באמצעות ZipFile בקריאה מלאה, ו־SHA256 נבדק לכל חבר. התקציבים הם64 חברים,16MiB לחבר JSON ו־64MiB לכל התוכן המורחב; קלט ZIP מוגבל ל־256MiB. פורמט ZIP לא נתמך יידחה. קבלת תאימות לארטיפקט GitHub אמיתי עדיין לא בוצעה, ואינה נובעת מ־fixtures.

שינוי whitespace ב־postflight בתוך ZIP, לאחר קשירת digest/size חיצוניים מחדש אך בלי שינוי pin הבתים המקורי של החבר, נדחה. זו נקודת ההבדל מהסתמכות על ZIP hash ועל מפה נפרדת של קבצים מחולצים בלי הוכחת חברות.

## המקור וראיות macOS

שני source snapshots מקוריים, לפני download ולפני upload, חייבים להתאים לאותו SHA/tree/tool/run/attempt/phase/version/build ולמפת sourceInputs מלאה עם יותר500 קבצים. הטביעה הקנונית של המפה מקובעת בנפרד; metadata/package/package-lock מוצלבים למפה. ארבע הפניות ה־CI חייבות להתאים למזהים המקובעים ולאותו מקור/ניסיון1/success. **אין כאן מימוש מחדש של verifyRuns או קבלת כל תפקידי18 ה־QA**: קריאת CI חיה וקבלת Native המדויקת באמצעות השומרים המשותפים הן תנאי נפרד לפני האודיט.

upload-origin ו־original-artifact-before-upload מוצלבים ל־IPA SHA256, מקור/tree, signing tool/run/artifact/digest המקוריים. rebuilt חייב false; דוח macOS המקורי חייב להעיד על חתימה, canonical WWW, מקור ופרופיל תקין עם תעודה ידועה, ללא debug entitlement ובתוקף ביחס לשעון הנתון. המאמת אינו מפענח IPA/TAR ואינו מריץ codesign. אלה בדיקות מקור וקישור של דוחות macOS בבייטים שנקשרו, לא אימות חתימה עצמאי חדש. אימות AES AAD ויתר ראיות החתימה המקוריות נשאר באחריות השומרים המקוריים והאינטגרציה העתידית.

## postflight וגבולות הקבלה

App6809952514, bundle com.sogrimhashbon.app ו־4.58/194 קבועים. Build ID האמיתי נשאר PENDING. postflight ו־completion נדרשים להסכים על Build ID/version/build/VALID; אין די ב־success=true או completion בלבד. source/completion/postflight/run timestamps נשמרים ומוצלבים, בלי reset לזמן ההרצה.

postflight האמיתי מצמצם build ל־id/build/version/processingState. אין בו platform/expired/bundle/IPA; לא הומצאו בו שדות כאלה. שיוך IOS נשען על מקור כלי postflight בלתי משתנה שנסקר, ובודק preReleaseVersion.platform=IOS, ועל חוזה4.58/194. זה אינו readback עצמאי של תגובת Apple הגולמית. metadata וראיות macOS משלימות bundle/IPA/profile; האודיט החי הנפרד עדיין חסר.

נדרשים GET_ONLY, אותו Store baseline, אפס קבוצות ואפס בודקים פרטניים של194, appStoreVersion=null והיעדר194 ברשימות הקבוצות שתועדו. databaseAccepted/publicReleaseAccepted/distributionAllowed חייבים להיות false במקור וב־postflight ונשארים false בתוצר. אין מסקנה על baseline מלא לבעלים, תקינות Production או זמינות ב־TestFlight. receipt כולל ownerAvailabilityAccepted=false.

התוצר הוא receiptBytes קנוניים ו־receiptSha256, scope של הכנה בלבד, עם source/tree/IPA/tool/run/job/artifact/digests וטביעות כל הקלטים וכל חברי ה־ZIP המקוריים. זו קבלה נגזרת חדשה, ולא שינוי של postflight המקורי.

## הראיות והחסמים שנותרו

118 בקרות Python סינתטיות עברו בזיכרון. הן כוללות PENDING לפני צריכת קלט, הצלחה דטרמיניסטית ב־stored/deflate, מקור/run/job/attempt/repo/path/event, גודל/digest/expiry/run של artifact, source-map, כפילויות JSON/ZIP, CRC, symlink/special/compression, מקור IPA/חתימה, תאריכים ו־postflight/VALID/false gates.

בקרת OLD/FINAL זהה אחת כשלה מול OLD ועברה מול FINAL. OLD הוא עותק מבוקר של המאמת החדש שבו הושמט **רק** אימות digest הבתים של חבר ZIP; הוא מדגים את החסר שהיה מתועד במתאם הקודם. הוא אינו ריצה של מתאם0daf או מאמת production היסטורי, ואינו export או מצב ריצה במודול החדש. בתוך הסוויטה קיימת גם בקרה המאשרת ש־OLD אכן מקבל את ההחלפה הסינתטית.

קובץ הבדיקה טוען את source השמור רק לצורך בדיקות מקומיות, ומחליף את מקטע PINS בעותק בזיכרון. המודול המקורי נשאר PENDING. בסט fixtures כל run/job/artifact/Build ID וה־IPA bytes סינתטיים במוצהר. לא פוענח או אומת ארטיפקט194 אמיתי.

Root צריך לשמור את שלושת הקבצים בתיקייה המבודדת ולהריץ:
`python -B -m unittest discover -s scripts/qa/ios-signing -p test_successful_intake.py`
לא נטענו כאן קבצי המאמת החדשים מהדיסק, כי לא נכתבו. בדיקות stdin אינן readback של commit חדש.

הכניסה הציבורית לאודיט נשארה זהה:9458 bytes, SHA256 `0444c02082372f1889a41d1669cb710ab2a11cac5e333db3469e4e756975cc89`. גם לאחר קשירה סינתטית היא עדיין חסומה בגלל מאמת/אינטגרציית namespace/provenance חסרים. לא הוסר החסם בעקבות הוספת helper זה. דרושים intake אמיתי מוצלח, נתוני GitHub מקוריים שקיבלו provenance חיצוני, קיבוע כל הטביעות וה־IDs, סקירת צורת הארכיון/הדוחות, ואינטגרציה נפרדת של audit tool/tree/run/job/checkout לפני Apple keys. המאמת הטהור אינו מוכיח בעצמו את מקור תגובות הרשת.

אודיט עתידי חייב לרוץ ב־run/job/artifact נפרדים אחרי הצלחת intake. כשל בו אינו משנה בדיעבד את תוצאת upload, אינו גורם rebuild/re-upload ואינו מבצע שיוך לבעלים. כל שילוב עתידי דורש סקירה וקריאה חזרה של מקור כלים immutable חדש.
