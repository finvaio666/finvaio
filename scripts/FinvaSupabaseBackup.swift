// Named wrapper so App Background Activity shows "FinvaSupabaseBackup"
// instead of "bash". launchd (io.finva.supabase-backup.plist) runs this
// binary, which just executes backup-supabase.sh.
// Rebuild: swiftc FinvaSupabaseBackup.swift -o FinvaSupabaseBackup
import Foundation

let task = Process()
task.executableURL = URL(fileURLWithPath: "/bin/bash")
task.arguments = ["/Applications/XAMPP/xamppfiles/htdocs/finvaio（atancw88）/scripts/backup-supabase.sh"]
try task.run()
task.waitUntilExit()
exit(task.terminationStatus)
