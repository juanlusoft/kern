import type {
  NumaHrCapabilityKey,
  NumaHrLeaveBalanceParams,
  NumaHrLeaveBalanceResult,
  NumaHrLeaveDaysParams,
  NumaHrLeaveDaysResult,
  NumaHrPunchDayParams,
  NumaHrPunchDayResult,
  NumaHrReadPort,
  NumaHrReportMonthByGroupParams,
  NumaHrReportMonthByGroupResult,
  NumaHrWorktimeSummaryParams,
  NumaHrWorktimeSummaryResult
} from '../../contracts/src/index';

export type {
  NumaHrCapabilityKey,
  NumaHrLeaveBalanceParams,
  NumaHrLeaveBalanceResult,
  NumaHrLeaveDaysParams,
  NumaHrLeaveDaysResult,
  NumaHrPunchDayParams,
  NumaHrPunchDayResult,
  NumaHrReadPort,
  NumaHrReportMonthByGroupParams,
  NumaHrReportMonthByGroupResult,
  NumaHrWorktimeSummaryParams,
  NumaHrWorktimeSummaryResult
} from '../../contracts/src/index';

export interface CoreNumaHrReadPort extends NumaHrReadPort {}

export function asCoreNumaHrReadPort(port: NumaHrReadPort): CoreNumaHrReadPort {
  return port;
}
