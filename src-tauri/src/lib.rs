// Tauri 命令：本地 JSON 持久化（appDataDir/data.json）
// 数据结构由前端定义（types.ts），此处仅透传 JSON 字符串，保证前后端模型单一来源。
use std::fs;
use std::path::PathBuf;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

/// 数据目录固定为 %APPDATA%\Jotter_xiaoji（避免与其他软件目录重名）
fn data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .data_dir()
        .map_err(|e| format!("无法定位应用数据目录: {e}"))?;
    let dir = base.join("Jotter_xiaoji");
    fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
    Ok(dir)
}

/// 返回数据文件完整路径，并确保目录存在
fn data_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join("data.json"))
}

/// 旧版本数据文件（旧 identifier 目录命名时代），用于首次启动自动迁移
fn legacy_data_file(app: &tauri::AppHandle) -> Option<PathBuf> {
    let base = app.path().data_dir().ok()?;
    Some(base.join("com.zhuaf.sticky-notes").join("data.json"))
}

/// 读取数据；首次启动（文件不存在）自动从旧目录迁移，仍无则返回空字符串
#[tauri::command]
fn load_data(app: tauri::AppHandle) -> Result<String, String> {
    let path = data_file(&app)?;
    if !path.exists() {
        if let Some(old) = legacy_data_file(&app) {
            if old.exists() {
                let _ = fs::copy(&old, &path);
            }
        }
    }
    match fs::read_to_string(&path) {
        Ok(s) => Ok(s),
        Err(_) => Ok(String::new()),
    }
}

/// 原子写入：先写临时文件再重命名，避免写一半崩溃导致数据损坏
#[tauri::command]
fn save_data(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let path = data_file(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| format!("写入失败: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("落盘失败: {e}"))
}

/// 供「设置」面板展示数据文件位置
#[tauri::command]
fn data_path(app: tauri::AppHandle) -> Result<String, String> {
    data_file(&app).map(|p| p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![load_data, save_data, data_path])
        .setup(|app| {
            // 系统托盘：左键点击唤起主窗口，右键菜单可退出（需求：关闭窗口仅隐藏到托盘）
            let show = MenuItem::with_id(app, "show", "显示主窗口", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("main-tray")
                .icon(
                    app.default_window_icon()
                        .expect("缺少应用图标")
                        .clone(),
                )
                .tooltip("小记 Jotter")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => show_main(app),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 显示并聚焦主窗口
fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}
