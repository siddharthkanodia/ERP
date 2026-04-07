import { getDailyAttendance } from "@/actions/attendance";
import { AttendanceDashboard } from "@/components/attendance/AttendanceDashboard";

export default async function AttendanceModulePage() {
  const today = new Date();
  const rows = await getDailyAttendance(today);

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Attendance</h1>
        <p className="text-sm text-muted-foreground">
          Daily attendance tracker
        </p>
      </header>

      <AttendanceDashboard rows={rows} date={today} />
    </section>
  );
}

