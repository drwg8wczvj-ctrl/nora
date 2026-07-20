import Foundation
import Capacitor
import HealthKit

// Bridges HealthKitManager to JS. Registered the same way as
// NativeTabBarPlugin — see BridgeViewController.capacitorDidLoad() — because
// local (non-npm) CAPBridgedPlugin conformers aren't reliably auto-discovered
// in this project's SPM setup.
//
// Every query method takes plain metric-key strings (see HealthKitTypes in
// HealthKitManager.swift) rather than one method per metric, so a new
// HealthKit metric is normally just a new case there — this plugin's surface
// doesn't need to grow.
@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable",              returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRequestedStatus",       returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryCategorySamples",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryQuantitySamples",     returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryQuantityStatistics",  returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queryWorkouts",             returnType: CAPPluginReturnPromise),
    ]

    private let manager = HealthKitManager.shared
    // JS's Date#toISOString() always includes milliseconds (e.g.
    // "2026-07-20T10:30:00.000Z") — the plain ISO8601DateFormatter() fails
    // to parse those unless .withFractionalSeconds is set, so this is the
    // formatter used for every incoming date, not a fallback.
    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    private let isoFormatterNoFraction = ISO8601DateFormatter()

    private func parseDate(_ call: CAPPluginCall, _ key: String) -> Date? {
        guard let raw = call.getString(key) else { return nil }
        return isoFormatter.date(from: raw) ?? isoFormatterNoFraction.date(from: raw)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": manager.isAvailable])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard let categories = call.getArray("categories") as? [String], !categories.isEmpty else {
            call.reject("categories (string[]) required")
            return
        }
        manager.requestAuthorization(categories: categories) { success, error in
            if let error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve(["granted": success])
            }
        }
    }

    @objc func getRequestedStatus(_ call: CAPPluginCall) {
        guard let categories = call.getArray("categories") as? [String], !categories.isEmpty else {
            call.reject("categories (string[]) required")
            return
        }
        call.resolve(["status": manager.requestedStatus(categories: categories)])
    }

    @objc func queryCategorySamples(_ call: CAPPluginCall) {
        guard let type = call.getString("type"),
              let start = parseDate(call, "startDate"),
              let end = parseDate(call, "endDate")
        else {
            call.reject("type, startDate, endDate required")
            return
        }
        manager.queryCategorySamples(typeKey: type, start: start, end: end) { [weak self] samples, error in
            guard let self else { return }
            if let error { call.reject(error.localizedDescription); return }
            let mapped = (samples ?? []).map { sample -> [String: Any] in
                [
                    "start": self.isoFormatter.string(from: sample.startDate),
                    "end": self.isoFormatter.string(from: sample.endDate),
                    "value": sample.value,
                ]
            }
            call.resolve(["samples": mapped])
        }
    }

    @objc func queryQuantitySamples(_ call: CAPPluginCall) {
        guard let type = call.getString("type"),
              let start = parseDate(call, "startDate"),
              let end = parseDate(call, "endDate")
        else {
            call.reject("type, startDate, endDate required")
            return
        }
        let unit = HealthKitTypes.defaultUnit(for: type)
        manager.queryQuantitySamples(typeKey: type, start: start, end: end) { [weak self] samples, error in
            guard let self else { return }
            if let error { call.reject(error.localizedDescription); return }
            let mapped = (samples ?? []).map { sample -> [String: Any] in
                [
                    "start": self.isoFormatter.string(from: sample.startDate),
                    "end": self.isoFormatter.string(from: sample.endDate),
                    "value": sample.quantity.doubleValue(for: unit),
                ]
            }
            call.resolve(["samples": mapped])
        }
    }

    @objc func queryQuantityStatistics(_ call: CAPPluginCall) {
        guard let type = call.getString("type"),
              let start = parseDate(call, "startDate"),
              let end = parseDate(call, "endDate")
        else {
            call.reject("type, startDate, endDate required")
            return
        }
        let aggregation = call.getString("aggregation") ?? "sum"
        manager.queryQuantityStatistics(typeKey: type, start: start, end: end, aggregation: aggregation) { value, error in
            if let error { call.reject(error.localizedDescription); return }
            call.resolve(["value": value ?? NSNull()])
        }
    }

    @objc func queryWorkouts(_ call: CAPPluginCall) {
        guard let start = parseDate(call, "startDate"),
              let end = parseDate(call, "endDate")
        else {
            call.reject("startDate, endDate required")
            return
        }
        manager.queryWorkouts(start: start, end: end) { [weak self] workouts, error in
            guard let self else { return }
            if let error { call.reject(error.localizedDescription); return }
            let mapped = (workouts ?? []).map { workout -> [String: Any] in
                // Prefer the modern per-type statistics API (iOS 16+, populated
                // for HKWorkoutBuilder-created workouts); fall back to the
                // older aggregate properties on earlier iOS (this project's
                // deployment target is iOS 15) and for workouts written by
                // apps that don't attach statistics, so both keep working.
                var energyKcal = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie())
                var distanceMeters = workout.totalDistance?.doubleValue(for: .meter())
                if #available(iOS 16.0, *) {
                    if let stat = workout.statistics(for: HKQuantityType(.activeEnergyBurned))?.sumQuantity()?.doubleValue(for: .kilocalorie()) {
                        energyKcal = stat
                    }
                    if let stat = workout.statistics(for: HKQuantityType(.distanceWalkingRunning))?.sumQuantity()?.doubleValue(for: .meter()) {
                        distanceMeters = stat
                    }
                }
                return [
                    "type": String(workout.workoutActivityType.rawValue),
                    "typeName": workout.workoutActivityType.displayName,
                    "start": self.isoFormatter.string(from: workout.startDate),
                    "end": self.isoFormatter.string(from: workout.endDate),
                    "durationMinutes": workout.duration / 60,
                    "activeEnergyKcal": energyKcal ?? NSNull(),
                    "distanceMeters": distanceMeters ?? NSNull(),
                ]
            }
            call.resolve(["workouts": mapped])
        }
    }
}
