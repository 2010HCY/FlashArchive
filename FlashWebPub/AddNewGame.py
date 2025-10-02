import tkinter as Tk
from tkinter import ttk
import os
import json
from datetime import datetime
import subprocess
import sys
import tempfile
import shutil   

def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

# 主窗口
class GameAdderApp:
    def __init__(self, root):
        self.root = root
        root.title("FlashWebPub")
        root.geometry("260x280")
        root.resizable(False, False)

        try:
            embedded_icon_path = resource_path("icon.ico")
            
            temp_dir = tempfile.gettempdir()
            temp_icon_path = os.path.join(temp_dir, f"FlashWebPub_icon_{os.getpid()}.ico")
            
            if not os.path.exists(temp_icon_path) or os.path.getmtime(embedded_icon_path) > os.path.getmtime(temp_icon_path):
                shutil.copy2(embedded_icon_path, temp_icon_path)
            
            root.iconbitmap(temp_icon_path)
        
        except Exception as e:
            print(f"警告：设置内嵌窗口图标失败，程序将尝试使用默认图标。错误信息: {e}") 

        # ===== 变量 =====
        self.NameVar = Tk.StringVar()
        self.GameplayVar = Tk.StringVar()
        self.DescVar = Tk.StringVar()
        self.TimeVar = Tk.StringVar(value=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        self.StatusVar = Tk.StringVar(value="")

        # ===== UI =====
        main = ttk.Frame(root, padding=(20, 32, 20, 8))
        main.pack(fill="both", expand=True)

        # ===== 输入框 =====
        ttk.Label(main, text="游戏名称", font=("Microsoft YaHei", 12)).grid(row=0, column=0, sticky="w", padx=(0, 6), pady=(0, 4))
        ttk.Entry(main, textvariable=self.NameVar, width=18, font=("Microsoft YaHei", 12)).grid(row=0, column=1, sticky="ew", pady=(0, 2))

        ttk.Label(main, text="游戏玩法", font=("Microsoft YaHei", 12)).grid(row=1, column=0, sticky="w", padx=(0, 6), pady=4)
        ttk.Entry(main, textvariable=self.GameplayVar, width=18, font=("Microsoft YaHei", 12)).grid(row=1, column=1, sticky="ew", pady=2)

        ttk.Label(main, text="描述", font=("Microsoft YaHei", 12)).grid(row=2, column=0, sticky="w", padx=(0, 6), pady=4)
        ttk.Entry(main, textvariable=self.DescVar, width=18, font=("Microsoft YaHei", 12)).grid(row=2, column=1, sticky="ew", pady=2)

        ttk.Label(main, text="时间", font=("Microsoft YaHei", 12)).grid(row=3, column=0, sticky="w", padx=(0, 6), pady=4)
        ttk.Entry(main, textvariable=self.TimeVar, width=18, font=("Microsoft YaHei", 12)).grid(row=3, column=1, sticky="ew", pady=2)

        # 状态栏
        self.status_entry = ttk.Entry(main, textvariable=self.StatusVar, state="readonly")
        self.status_entry.grid(row=4, column=0, columnspan=2, sticky="ew", pady=(10, 6))

        # 发布
        ttk.Button(main, text="发布", command=self.OnSubmit).grid(row=5, column=0, columnspan=2, pady=(4, 0))
        main.columnconfigure(1, weight=1)
        root.bind("<Return>", lambda e: self.OnSubmit())

    # 更新状态栏
    def set_status(self, text):
        self.status_entry.configure(state="normal")
        self.StatusVar.set(text)
        self.status_entry.configure(state="readonly")
        self.root.update_idletasks()

    def OnSubmit(self):
        name = self.NameVar.get().strip()
        gameplay = self.GameplayVar.get().strip()
        desc = self.DescVar.get().strip()
        time_str = self.TimeVar.get().strip()

        # 校验
        if not name or not gameplay or not desc or not time_str:
            self.set_status("填写游戏信息")
            return

        # 1. 创建文件
        game_dir = os.path.join("Games", name)
        template_path = "Games/模板.html"
        index_path = os.path.join(game_dir, "index.html")
        try:
            os.makedirs(game_dir, exist_ok=True)
            self.set_status("正在生成页面…")
            with open(template_path, "r", encoding="utf-8") as f:
                html = f.read()
            html = html.replace("<游戏名称>", name).replace("<游戏玩法>", gameplay)
            with open(index_path, "w", encoding="utf-8") as f:
                f.write(html)
        except Exception as e:
            self.set_status(f"写入HTML失败：{e}")
            return

        # 2. 更新JSON
        json_path = os.path.join("api", "games_name.json")
        try:
            self.set_status("更新JSON…")
            data = []
            if os.path.exists(json_path):
                with open(json_path, "r", encoding="utf-8") as f:
                    try:
                        data = json.load(f) or []
                    except json.JSONDecodeError:
                        data = []

            new_id = str(int(data[-1]["id"]) + 1) if data and "id" in data[-1] and str(data[-1]["id"]).isdigit() else "1"
            new_game = {"id": new_id, "name": name, "desc": desc, "time": time_str}
            data.append(new_game)
            with open(json_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=4)
        except Exception as e:
            self.set_status(f"更新JSON失败：{e}")
            return

        def run_tool(exe_name, display):
            try:
                self.set_status(f"正在更新 {display} …")
                subprocess.run([exe_name], cwd=".", check=True)
                self.set_status(f"{display} 更新完成")
            except Exception as e:
                self.set_status(f"{display} 更新失败：{e}")

        run_tool("RSS.exe", "RSS")
        run_tool("sitemap.exe", "站点地图")

        self.set_status("游戏发布成功！")

if __name__ == "__main__":
    root = Tk.Tk()
    app = GameAdderApp(root)
    root.mainloop()