import tkinter as Tk
from tkinter import messagebox
import os
import json
from datetime import datetime
import subprocess

# 主窗口
class GameAdderApp:
    def __init__(self, Root):
        Root.title("FlashWebPub")
        Root.geometry("260x280")

        # 游戏名称
        Tk.Label(Root, text="游戏名称").pack()
        self.NameVar = Tk.StringVar()
        Tk.Entry(Root, textvariable=self.NameVar).pack()

        # 游戏玩法
        Tk.Label(Root, text="游戏玩法").pack()
        self.GameplayVar = Tk.StringVar()
        Tk.Entry(Root, textvariable=self.GameplayVar).pack()

        # 描述
        Tk.Label(Root, text="描述").pack()
        self.DescVar = Tk.StringVar()
        Tk.Entry(Root, textvariable=self.DescVar).pack()

        # 时间
        Tk.Label(Root, text="时间").pack()
        self.TimeVar = Tk.StringVar(value=datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        Tk.Entry(Root, textvariable=self.TimeVar).pack()

        # 状态显示
        Tk.Label(Root, text=" ").pack()
        self.StatusBar = Tk.StringVar()
        Tk.Entry(Root, textvariable=self.StatusBar).pack()

        # 提交按钮
        Tk.Button(Root, text="提交", command=self.OnSubmit).pack(pady=10)

    def OnSubmit(self):
        Name = self.NameVar.get().strip()
        Gameplay = self.GameplayVar.get().strip()
        Desc = self.DescVar.get().strip()
        Time = self.TimeVar.get().strip()

        if not Name or not Gameplay or not Desc or not Time:
            messagebox.showerror("错误", "所有字段都必须填写")
            return

        # 步骤1：创建游戏文件夹和index.html
        GameDir = os.path.join("Games", Name)
        os.makedirs(GameDir, exist_ok=True)
        TemplatePath = "Games/模板.html"
        IndexPath = os.path.join(GameDir, "index.html")
        try:
            with open(TemplatePath, "r", encoding="utf-8") as f:
                Html = f.read()
            Html = Html.replace("<游戏名称>", Name).replace("<游戏玩法>", Gameplay)
            with open(IndexPath, "w", encoding="utf-8") as f:
                f.write(Html)
        except Exception as E:
            messagebox.showerror("错误", f"写入HTML失败: {E}")
            return

        # 步骤2：更新games_name.json
        JsonPath = os.path.join("api", "games_name.json")
        try:
            with open(JsonPath, "r", encoding="utf-8") as f:
                Data = json.load(f)
            NewId = str(int(Data[-1]["id"]) + 1) if Data else "1"
            NewGame = {
                "id": NewId,
                "name": Name,
                "desc": Desc,
                "time": Time
            }
            Data.append(NewGame)
            with open(JsonPath, "w", encoding="utf-8") as f:
                json.dump(Data, f, ensure_ascii=False, indent=4)
        except Exception as E:
            messagebox.showerror("错误", f"更新JSON失败: {E}")
            return

        # 步骤3：运行RSS.exe和sitemap.exe
        try:
            subprocess.run(["RSS.exe"], cwd=".", check=True)
            subprocess.run(["sitemap.exe"], cwd=".", check=True)
        except Exception as E:
            messagebox.showwarning("警告", f"更新RSS或站点地图失败: {E}")

        messagebox.showinfo("成功", "新游戏添加成功！")

if __name__ == "__main__":
    Root = Tk.Tk()
    App = GameAdderApp(Root)
    Root.mainloop()