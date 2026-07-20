import Foundation
import HealthKit

// ─── Metric registry ───────────────────────────────────────────────────────────
//
// The single place that knows how a metric key string (used on the JS side)
// maps to a real HKObjectType/HKUnit. Adding a new HealthKit metric later is
// one new case in `quantityType(for:)`/`defaultUnit(for:)` (or `categoryType`)
// — nothing else in this plugin needs to change, since HealthKitPlugin's
// query methods are all generic over these keys.

enum HealthCategory: String, CaseIterable {
    case sleep
    case activity
    case heart
    case mindfulness
    case vo2max
    case respiratory
}

enum HealthKitTypes {
    // Quantity-type metric keys this app knows about, one HKQuantityTypeIdentifier
    // and a sensible default unit each — this is the extension point for adding
    // a new quantity metric.
    static func quantityType(for key: String) -> HKQuantityType? {
        guard let identifier = quantityIdentifier(for: key) else { return nil }
        return HKObjectType.quantityType(forIdentifier: identifier)
    }

    private static func quantityIdentifier(for key: String) -> HKQuantityTypeIdentifier? {
        switch key {
        case "stepCount":                  return .stepCount
        case "distanceWalkingRunning":     return .distanceWalkingRunning
        case "activeEnergyBurned":         return .activeEnergyBurned
        case "appleExerciseTime":          return .appleExerciseTime
        case "flightsClimbed":             return .flightsClimbed
        case "restingHeartRate":           return .restingHeartRate
        case "heartRate":                  return .heartRate
        case "walkingHeartRateAverage":    return .walkingHeartRateAverage
        case "heartRateVariabilitySDNN":   return .heartRateVariabilitySDNN
        case "vo2Max":                     return .vo2Max
        case "respiratoryRate":            return .respiratoryRate
        default:                           return nil
        }
    }

    static func defaultUnit(for key: String) -> HKUnit {
        switch key {
        case "stepCount", "flightsClimbed":
            return .count()
        case "distanceWalkingRunning":
            return .meter()
        case "activeEnergyBurned":
            return .kilocalorie()
        case "appleExerciseTime":
            return .minute()
        case "restingHeartRate", "heartRate", "walkingHeartRateAverage":
            return HKUnit.count().unitDivided(by: .minute())
        case "heartRateVariabilitySDNN":
            return .secondUnit(with: .milli)
        case "vo2Max":
            return HKUnit(from: "mL/kg*min")
        case "respiratoryRate":
            return HKUnit.count().unitDivided(by: .minute())
        default:
            return .count()
        }
    }

    static func categoryType(for key: String) -> HKCategoryType? {
        switch key {
        case "sleepAnalysis":   return HKObjectType.categoryType(forIdentifier: .sleepAnalysis)
        case "mindfulSession":  return HKObjectType.categoryType(forIdentifier: .mindfulSession)
        default:                return nil
        }
    }

    // Every HKObjectType a given permission category needs read access to.
    // "activity" includes workoutType() so workout queries work once granted.
    static func readTypes(for category: HealthCategory) -> Set<HKObjectType> {
        switch category {
        case .sleep:
            return Set([categoryType(for: "sleepAnalysis")].compactMap { $0 })
        case .activity:
            var types: [HKObjectType?] = [
                quantityType(for: "stepCount"),
                quantityType(for: "distanceWalkingRunning"),
                quantityType(for: "activeEnergyBurned"),
                quantityType(for: "appleExerciseTime"),
                quantityType(for: "flightsClimbed"),
            ]
            types.append(HKObjectType.workoutType())
            return Set(types.compactMap { $0 })
        case .heart:
            return Set([
                quantityType(for: "restingHeartRate"),
                quantityType(for: "heartRate"),
                quantityType(for: "walkingHeartRateAverage"),
                quantityType(for: "heartRateVariabilitySDNN"),
            ].compactMap { $0 })
        case .mindfulness:
            return Set([categoryType(for: "mindfulSession")].compactMap { $0 })
        case .vo2max:
            return Set([quantityType(for: "vo2Max")].compactMap { $0 })
        case .respiratory:
            return Set([quantityType(for: "respiratoryRate")].compactMap { $0 })
        }
    }
}

// ─── Manager ────────────────────────────────────────────────────────────────
//
// Thin, testable wrapper around HKHealthStore. Read-only — this app never
// writes to HealthKit. All completion handlers land on an arbitrary
// HealthKit background queue; HealthKitPlugin.swift is responsible for
// hopping back to the calling convention CAPPluginCall expects (call.resolve/
// reject can be invoked from any thread, so no explicit main-thread hop is
// required here, unlike UI-touching plugins such as NativeTabBarPlugin).
final class HealthKitManager {
    static let shared = HealthKitManager()
    private let store = HKHealthStore()

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestAuthorization(categories: [String], completion: @escaping (Bool, Error?) -> Void) {
        guard isAvailable else {
            completion(false, NSError(domain: "HealthKit", code: 1, userInfo: [NSLocalizedDescriptionKey: "Health data is not available on this device."]))
            return
        }
        let known = categories.compactMap { HealthCategory(rawValue: $0) }
        let readTypes = known.reduce(into: Set<HKObjectType>()) { acc, category in
            acc.formUnion(HealthKitTypes.readTypes(for: category))
        }
        guard !readTypes.isEmpty else {
            completion(false, NSError(domain: "HealthKit", code: 2, userInfo: [NSLocalizedDescriptionKey: "No recognized health categories requested."]))
            return
        }
        // Read-only app — nothing is ever written back to HealthKit.
        store.requestAuthorization(toShare: nil, read: readTypes) { success, error in
            completion(success, error)
        }
    }

    // NOTE ON READ-PERMISSION STATUS: Apple deliberately does not let an app
    // learn whether the USER granted or denied read access to a given type
    // (only whether they've been ASKED) — this is intentional, so a person
    // can decline to share e.g. mental-health data without the app being
    // able to detect and pester them about it. `authorizationStatus(for:)`
    // reliably reports this "has it been requested" bit; whether it
    // actually returns data is only knowable by querying and seeing if
    // anything comes back. The JS layer treats "was requested" + "query
    // returned data at least once" as its working definition of "connected"
    // for a category — see healthKit.js.
    func requestedStatus(categories: [String]) -> [String: Bool] {
        var result: [String: Bool] = [:]
        for raw in categories {
            guard let category = HealthCategory(rawValue: raw) else { continue }
            let types = HealthKitTypes.readTypes(for: category)
            // "requested" if EVERY type in the category is past notDetermined.
            let requested = !types.isEmpty && types.allSatisfy { type in
                guard let sampleType = type as? HKSampleType else { return true }
                return store.authorizationStatus(for: sampleType) != .notDetermined
            }
            result[raw] = requested
        }
        return result
    }

    func queryCategorySamples(typeKey: String, start: Date, end: Date, completion: @escaping ([HKCategorySample]?, Error?) -> Void) {
        guard let type = HealthKitTypes.categoryType(for: typeKey) else {
            completion(nil, NSError(domain: "HealthKit", code: 3, userInfo: [NSLocalizedDescriptionKey: "Unknown category type: \(typeKey)"]))
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            completion(samples as? [HKCategorySample], error)
        }
        store.execute(query)
    }

    func queryQuantitySamples(typeKey: String, start: Date, end: Date, completion: @escaping ([HKQuantitySample]?, Error?) -> Void) {
        guard let type = HealthKitTypes.quantityType(for: typeKey) else {
            completion(nil, NSError(domain: "HealthKit", code: 4, userInfo: [NSLocalizedDescriptionKey: "Unknown quantity type: \(typeKey)"]))
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            completion(samples as? [HKQuantitySample], error)
        }
        store.execute(query)
    }

    func queryQuantityStatistics(typeKey: String, start: Date, end: Date, aggregation: String, completion: @escaping (Double?, Error?) -> Void) {
        guard let type = HealthKitTypes.quantityType(for: typeKey) else {
            completion(nil, NSError(domain: "HealthKit", code: 5, userInfo: [NSLocalizedDescriptionKey: "Unknown quantity type: \(typeKey)"]))
            return
        }
        let unit = HealthKitTypes.defaultUnit(for: typeKey)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let options: HKStatisticsOptions = aggregation == "average" ? .discreteAverage
            : aggregation == "min" ? .discreteMin
            : aggregation == "max" ? .discreteMax
            : .cumulativeSum
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: options) { _, statistics, error in
            guard let statistics else { completion(nil, error); return }
            let quantity: HKQuantity? = {
                switch options {
                case .discreteAverage: return statistics.averageQuantity()
                case .discreteMin:     return statistics.minimumQuantity()
                case .discreteMax:     return statistics.maximumQuantity()
                default:                return statistics.sumQuantity()
                }
            }()
            completion(quantity?.doubleValue(for: unit), nil)
        }
        store.execute(query)
    }

    func queryWorkouts(start: Date, end: Date, completion: @escaping ([HKWorkout]?, Error?) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            completion(samples as? [HKWorkout], error)
        }
        store.execute(query)
    }
}

// Human-readable workout type names, for the JS side to display without
// needing its own copy of HKWorkoutActivityType's raw values.
extension HKWorkoutActivityType {
    var displayName: String {
        switch self {
        case .running:            return "Running"
        case .walking:             return "Walking"
        case .cycling:             return "Cycling"
        case .swimming:            return "Swimming"
        case .traditionalStrengthTraining, .functionalStrengthTraining:
            return "Strength Training"
        case .yoga:                return "Yoga"
        case .coreTraining:        return "Core Training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .hiking:              return "Hiking"
        case .elliptical:          return "Elliptical"
        case .rowing:              return "Rowing"
        case .dance, .cardioDance: return "Dance"
        case .mindAndBody:         return "Mind & Body"
        case .other:               return "Workout"
        default:                   return "Workout"
        }
    }
}
