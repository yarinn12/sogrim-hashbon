export const demoState = {
  currentParticipantId: "yarin",
  participants: [
    { id: "yarin", displayName: "ירין", kind: "user" },
    { id: "dani", displayName: "דני", kind: "user" },
    { id: "avi", displayName: "אבי", kind: "user" },
    { id: "maor", displayName: "מאור", kind: "guest" }
  ],
  groups: [
    {
      id: "thursday",
      name: "החבר'ה של חמישי",
      memberIds: ["yarin", "dani", "avi"],
      adminIds: ["yarin"],
      archived: false
    }
  ],
  events: [
    {
      id: "event-demo",
      name: "חמישי בבר",
      groupId: "thursday",
      participantIds: ["yarin", "dani", "avi", "maor"],
      expenses: [
        {
          id: "taxi",
          name: "מונית",
          total: 11000,
          payers: [
            { participantId: "dani", amount: 5000 },
            { participantId: "avi", amount: 6000 }
          ],
          sharedByParticipantIds: ["yarin", "dani", "avi", "maor"],
          createdByParticipantId: "dani",
          updatedAt: "2026-05-23T00:00:00.000Z"
        }
      ],
      transfers: [],
      adminIds: ["yarin"],
      createdByParticipantId: "yarin",
      adminsCanEditOnly: false,
      locked: false,
      createdAt: "2026-05-23T00:00:00.000Z"
    }
  ]
};
