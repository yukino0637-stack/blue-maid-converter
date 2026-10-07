import AppKit
import Carbon

// 独立于人物进程：人物真正退出后仍可用 Command+D 打开。
guard CommandLine.arguments.count == 2 else { exit(1) }
let launcher = URL(fileURLWithPath: CommandLine.arguments[1])
let application = NSApplication.shared
application.setActivationPolicy(.prohibited)
let hotKey = HotKey(key: .d, modifiers: [.command])
// 上游没有公开注册结果；与源码一起编译，检查实际 Carbon 注册是否成功。
guard HotKeysController.hotKeys.values.contains(where: { $0.carbonEventHotKey != nil }) else {
    fputs("Command+D 注册失败，可能已被其他后台程序占用。\n", stderr)
    exit(1)
}
var opening = false
var lastOpen = Date.distantPast
hotKey.keyDownHandler = {
    guard !opening, Date().timeIntervalSince(lastOpen) > 1 else { return }
    guard FileManager.default.fileExists(atPath: launcher.path) else {
        fputs("小女仆启动入口不存在，请重新安装本项目启动入口。\n", stderr)
        return
    }
    opening = true
    lastOpen = Date()
    print("Command+D：打开小女仆")
    fflush(stdout)
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = false
    NSWorkspace.shared.openApplication(at: launcher, configuration: configuration) { _, error in
        DispatchQueue.main.async {
            opening = false
            if error != nil { fputs("小女仆打开失败，请检查启动入口和项目目录。\n", stderr) }
        }
    }
}
print("Command+D 已注册；人物退出后仍保留启动能力。")
fflush(stdout)
application.run()
