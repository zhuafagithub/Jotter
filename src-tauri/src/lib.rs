// Tauri 命令：本地 JSON 持久化（appDataDir/data.json）
// 数据结构由前端定义（types.ts），此处仅透传 JSON 字符串，保证前后端模型单一来源。
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager,
};

/// 更新检查所指向的 GitHub 仓库
const RELEASE_API: &str = "https://api.github.com/repos/zhuafagithub/Jotter/releases/latest";
const USER_AGENT: &str = "Jotter-Updater";

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

// ---------- 联网更新 ----------

#[derive(Serialize)]
struct ReleaseInfo {
    version: String,
    notes: String,
    url: String,
    size: u64,
    page_url: String,
}

#[derive(Clone, Serialize)]
struct UpdateProgress {
    downloaded: u64,
    total: u64,
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(USER_AGENT)
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("初始化网络客户端失败: {e}"))
}

/// 查询 GitHub 最新 Release，返回版本号、更新说明与安装包下载地址
#[tauri::command]
async fn check_update() -> Result<ReleaseInfo, String> {
    let resp = http_client()?
        .get(RELEASE_API)
        .send()
        .await
        .map_err(|e| format!("网络请求失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("GitHub 接口返回 {}", resp.status()));
    }
    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("解析响应失败: {e}"))?;

    let version = json["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();
    if version.is_empty() {
        return Err("未获取到版本号".to_string());
    }
    let notes = json["body"].as_str().unwrap_or("").to_string();
    let page_url = json["html_url"].as_str().unwrap_or("").to_string();

    let assets = json["assets"].as_array().cloned().unwrap_or_default();
    let asset = assets
        .iter()
        .find(|a| {
            a["name"]
                .as_str()
                .map(|n| n.to_lowercase().ends_with("-setup.exe"))
                .unwrap_or(false)
        })
        .ok_or_else(|| "最新版本尚未上传安装包".to_string())?;

    let url = asset["browser_download_url"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let size = asset["size"].as_u64().unwrap_or(0);
    if url.is_empty() {
        return Err("安装包下载地址为空".to_string());
    }

    Ok(ReleaseInfo {
        version,
        notes,
        url,
        size,
        page_url,
    })
}

/// 下载安装包到临时目录，过程中通过 update-progress 事件回报进度
#[tauri::command]
async fn download_update(
    app: tauri::AppHandle,
    url: String,
    version: String,
) -> Result<String, String> {
    let resp = http_client()?
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("下载失败: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("下载失败: HTTP {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);
    let dir = std::env::temp_dir().join("jotter-update");
    fs::create_dir_all(&dir).map_err(|e| format!("创建临时目录失败: {e}"))?;
    let file_path = dir.join(format!("Jotter_{version}_x64-setup.exe"));

    let mut file = fs::File::create(&file_path).map_err(|e| format!("创建文件失败: {e}"))?;
    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("读取数据流失败: {e}"))?;
        file.write_all(&chunk)
            .map_err(|e| format!("写入文件失败: {e}"))?;
        downloaded += chunk.len() as u64;
        let _ = app.emit("update-progress", UpdateProgress { downloaded, total });
    }
    file.flush().map_err(|e| format!("写入文件失败: {e}"))?;

    Ok(file_path.to_string_lossy().into_owned())
}

/// 启动安装程序，随后退出当前应用，由安装包完成覆盖升级
#[tauri::command]
fn install_update(app: tauri::AppHandle, path: String) -> Result<(), String> {
    std::process::Command::new(&path)
        .spawn()
        .map_err(|e| format!("启动安装程序失败: {e}"))?;
    // 稍等安装程序起来后再退出，避免本进程占用待替换的 exe
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(800));
        app.exit(0);
    });
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例：重复启动时聚焦已有窗口，避免多开（多个窗口 / 重复托盘图标）
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main(app);
        }))
        // 记忆窗口大小与位置（退出时保存，启动时恢复）
        // 不恢复 VISIBLE：本应用关闭窗口是隐藏到托盘，若把隐藏态存下来会导致下次启动不显示
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        & !tauri_plugin_window_state::StateFlags::VISIBLE,
                )
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_data,
            save_data,
            data_path,
            check_update,
            download_update,
            install_update
        ])
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
