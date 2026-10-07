// Buddy's window into Apple Calendar and Reminders (read-only).
//
//   buddy-eventkit events    <fromMs> <toMs>   timed events, as JSON
//   buddy-eventkit reminders <fromMs> <toMs>   unfinished reminders with a time, as JSON
//
// Prints one JSON line. On failure: {"error": "..."} and a non-zero exit.
// The first run makes macOS ask for permission; we wait for the answer.

import EventKit
import Foundation

let store = EKEventStore()

func printJSON(_ value: Any) {
    if let data = try? JSONSerialization.data(withJSONObject: value) {
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write("\n".data(using: .utf8)!)
    }
}

func fail(_ message: String, code: Int32 = 1) -> Never {
    printJSON(["error": message])
    exit(code)
}

final class Flag { var done = false; var ok = false }

// Spins the run loop until `body` calls back, so permission prompts and
// async fetches can finish in a command-line tool.
func wait(_ body: (Flag) -> Void) -> Flag {
    let flag = Flag()
    body(flag)
    while !flag.done {
        RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05))
    }
    return flag
}

func hasAccess(_ type: EKEntityType) -> Bool {
    let status = EKEventStore.authorizationStatus(for: type)
    if #available(macOS 14.0, *) {
        if status == .fullAccess { return true }
    } else if status == .authorized {
        return true
    }
    if status == .denied || status == .restricted { return false }

    let result = wait { flag in
        let done: (Bool, Error?) -> Void = { granted, _ in
            DispatchQueue.main.async {
                flag.ok = granted
                flag.done = true
            }
        }
        if #available(macOS 14.0, *) {
            if type == .event {
                store.requestFullAccessToEvents(completion: done)
            } else {
                store.requestFullAccessToReminders(completion: done)
            }
        } else {
            store.requestAccess(to: type, completion: done)
        }
    }
    return result.ok
}

func ms(_ date: Date) -> Double { (date.timeIntervalSince1970 * 1000).rounded() }

let args = CommandLine.arguments
guard args.count >= 4, let fromMs = Double(args[2]), let toMs = Double(args[3]) else {
    fail("usage: buddy-eventkit events|reminders <fromMs> <toMs>")
}
let from = Date(timeIntervalSince1970: fromMs / 1000)
let to = Date(timeIntervalSince1970: toMs / 1000)

switch args[1] {
case "events":
    guard hasAccess(.event) else { fail("denied", code: 2) }
    let predicate = store.predicateForEvents(withStart: from, end: to, calendars: nil)
    var out: [[String: Any]] = []
    for event in store.events(matching: predicate) {
        if event.isAllDay || event.status == .canceled { continue }
        // Skip meetings you've said no to.
        if let me = event.attendees?.first(where: { $0.isCurrentUser }), me.participantStatus == .declined {
            continue
        }
        guard let start = event.startDate else { continue }
        out.append([
            "id": event.calendarItemIdentifier,
            "title": event.title ?? "",
            "start": ms(start),
            "end": ms(event.endDate ?? start),
            "location": event.location ?? "",
            "notes": event.notes ?? "",
            "url": event.url?.absoluteString ?? "",
            "calendar": event.calendar?.title ?? "",
        ])
    }
    printJSON(out)

case "reminders":
    guard hasAccess(.reminder) else { fail("denied", code: 2) }
    let predicate = store.predicateForIncompleteReminders(
        withDueDateStarting: from, ending: to, calendars: nil)
    var found: [EKReminder] = []
    _ = wait { flag in
        store.fetchReminders(matching: predicate) { reminders in
            DispatchQueue.main.async {
                found = reminders ?? []
                flag.done = true
            }
        }
    }
    var out: [[String: Any]] = []
    for reminder in found {
        // An alert time wins; otherwise the due date, but only if it has a time.
        var due: Date? = reminder.alarms?.compactMap { $0.absoluteDate }.min()
        if due == nil, let comps = reminder.dueDateComponents, comps.hour != nil {
            due = Calendar.current.date(from: comps)
        }
        guard let when = due else { continue }
        out.append([
            "id": reminder.calendarItemIdentifier,
            "title": reminder.title ?? "",
            "due": ms(when),
            "list": reminder.calendar?.title ?? "",
        ])
    }
    printJSON(out)

default:
    fail("unknown command \(args[1])")
}
