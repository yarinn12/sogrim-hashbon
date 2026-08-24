import test from "node:test";
import assert from "node:assert/strict";

import {
  formatEventReport,
  formatSettlementSummary
} from "../src/domain/settlementSummary.mjs";

const participants = [
  { id: "dani", displayName: "דני", kind: "user" },
  { id: "avi", displayName: "אבי", kind: "user" },
  { id: "yarin", displayName: "ירין", kind: "user" },
  { id: "maor", displayName: "מאור", kind: "guest" }
];

test("formatSettlementSummary lists only pending transfers", () => {
  const summary = formatSettlementSummary({
    eventName: "יציאה חמישי",
    participants,
    transfers: [
      {
        id: "transfer-yarin-avi-2750",
        fromParticipantId: "yarin",
        toParticipantId: "avi",
        amount: 2750,
        status: "pending"
      },
      {
        id: "transfer-maor-dani-2250",
        fromParticipantId: "maor",
        toParticipantId: "dani",
        amount: 2250,
        status: "paid"
      }
    ]
  });

  assert.equal(
    summary,
    [
      "*סוגרים חשבון — \u2067יציאה חמישי\u2069*",
      "",
      "*מי מעביר למי:*",
      "הסכומים חושבו כך שיהיו כמה שפחות העברות בקבוצה.",
      "",
      "• \u2067ירין\u2069 צריך להעביר ל־\u2067אבי\u2069: \u206627.50 ₪\u2069"
    ].join("\n")
  );
});

test("formatSettlementSummary says the event is closed when no pending transfer remains", () => {
  const summary = formatSettlementSummary({
    eventName: "יציאה חמישי",
    participants,
    transfers: [
      {
        id: "transfer-maor-dani-2250",
        fromParticipantId: "maor",
        toParticipantId: "dani",
        amount: 2250,
        status: "paid"
      }
    ]
  });

  assert.equal(
    summary,
    "*סוגרים חשבון — \u2067יציאה חמישי\u2069*\n\nהכול סגור. אין העברות פתוחות."
  );
});

test("formatEventReport includes expenses and pending settlement", () => {
  const report = formatEventReport({
    eventName: "יציאה חמישי",
    participants,
    expenses: [
      {
        id: "taxi",
        name: "מונית",
        total: 11000,
        payers: [
          { participantId: "dani", amount: 5000 },
          { participantId: "avi", amount: 6000 }
        ],
        sharedByParticipantIds: ["dani", "avi", "yarin", "maor"],
        createdByParticipantId: "dani",
        updatedAt: "2026-05-23T00:00:00.000Z"
      }
    ],
    transfers: [
      {
        id: "transfer-yarin-avi-2750",
        fromParticipantId: "yarin",
        toParticipantId: "avi",
        amount: 2750,
        status: "pending"
      },
      {
        id: "transfer-maor-dani-2250",
        fromParticipantId: "maor",
        toParticipantId: "dani",
        amount: 2250,
        status: "paid"
      }
    ]
  });

  assert.equal(
    report,
    [
      "דוח אירוע - יציאה חמישי",
      "הוצאות:",
      "- מונית: ₪110.00 | שילמו: דני ₪50.00, אבי ₪60.00 | שותפים: דני, אבי, ירין, מאור",
      "התחשבנות פתוחה:",
      "הסכומים חושבו כך שיהיו כמה שפחות העברות בקבוצה.",
      "",
      "• \u2067ירין\u2069 צריך להעביר ל־\u2067אבי\u2069: \u206627.50 ₪\u2069"
    ].join("\n")
  );
});

test("formatSettlementSummary uses the event currency", () => {
  const summary = formatSettlementSummary({
    eventName: "New York",
    participants: [
      { id: "a", displayName: "A" },
      { id: "b", displayName: "B" }
    ],
    transfers: [
      {
        id: "transfer-a-b",
        fromParticipantId: "a",
        toParticipantId: "b",
        amount: 4250,
        status: "pending"
      }
    ],
    currency: "USD"
  });

  assert.match(summary, /42\.50 \$/);
  assert.doesNotMatch(summary, /₪/);
});

test("settlement copy distinguishes short aliases for people with the same name", () => {
  const summary = formatSettlementSummary({
    eventName: "Dinner",
    participants: [
      {
        id: "dani-connected",
        displayName: "דני כהן",
        authProvider: "google",
        authSubject: "google-dani"
      },
      { id: "dani-manual", displayName: "דני כהן", kind: "guest" }
    ],
    participantAliases: {
      "dani-connected": "בן דוד",
      "dani-manual": "מהעבודה"
    },
    transfers: [
      {
        id: "transfer-dani",
        fromParticipantId: "dani-manual",
        toParticipantId: "dani-connected",
        amount: 2500,
        status: "pending"
      }
    ]
  });

  assert.match(summary, /• \u2067דני כהן · מהעבודה\u2069 צריך להעביר ל־\u2067דני כהן · בן דוד\u2069: \u206625\.00 ₪\u2069/);
});

test("settlement copy groups several senders under one preferred recipient name", () => {
  const summary = formatSettlementSummary({
    eventName: "לובי של ניזרי",
    participants: [
      { id: "yarin", displayName: "Yarin Izhak" },
      { id: "harel", displayName: "הראל" },
      { id: "ariel", displayName: "אריאל ניזרי" },
      { id: "maor", displayName: "Awesome Maor", accountLinked: true }
    ],
    participantAliases: {
      maor: "מאור סיבוני"
    },
    transfers: [
      { fromParticipantId: "yarin", toParticipantId: "maor", amount: 8200 },
      { fromParticipantId: "harel", toParticipantId: "maor", amount: 8200 },
      { fromParticipantId: "ariel", toParticipantId: "maor", amount: 900 }
    ]
  });

  assert.equal(
    summary,
    [
      "*סוגרים חשבון — \u2067לובי של ניזרי\u2069*",
      "",
      "*מי מעביר למי:*",
      "הסכומים חושבו כך שיהיו כמה שפחות העברות בקבוצה.",
      "",
      "• \u2066Yarin Izhak\u2069 צריך להעביר ל־\u2067מאור סיבוני\u2069: \u206682.00 ₪\u2069",
      "• \u2067הראל\u2069 צריך להעביר ל־\u2067מאור סיבוני\u2069: \u206682.00 ₪\u2069",
      "• \u2067אריאל ניזרי\u2069 צריך להעביר ל־\u2067מאור סיבוני\u2069: \u20669.00 ₪\u2069"
    ].join("\n")
  );
  assert.doesNotMatch(summary, /Awesome Maor/);
});

test("settlement copy explains direct reimbursements without calling them smart offsets", () => {
  const summary = formatSettlementSummary({
    eventName: "טיול",
    participants,
    transfers: [
      {
        fromParticipantId: "yarin",
        toParticipantId: "avi",
        amount: 2750,
        status: "pending"
      }
    ],
    directSettlementTransfers: true
  });

  assert.match(summary, /הסכומים מחזירים כסף ישירות למי ששילם/);
  assert.doesNotMatch(summary, /כדי לצמצם העברות/);
});
