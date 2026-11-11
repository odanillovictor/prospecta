' Inicia o coletor do Prospecta (Google Maps) em segundo plano, sem janela.
' Para iniciar junto com o Windows: copie este arquivo para a pasta Inicializar (Win+R -> shell:startup).
Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
sh.CurrentDirectory = fs.GetParentFolderName(fs.GetParentFolderName(WScript.ScriptFullName))
sh.Run "node coletor\server.mjs", 0, False
