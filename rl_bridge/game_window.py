"""Restore the match window when a prepared series game is ready for input."""
import sys


def rocket_league_window_ready(pids):
    """A visible, responsive game viewport owned by the current game process."""
    if sys.platform != 'win32':return False
    try:
        import ctypes
        from ctypes import wintypes
        user,window=_rocket_window()
        if not window:return False
        pid=wintypes.DWORD();user.GetWindowThreadProcessId(window,ctypes.byref(pid))
        user.IsHungAppWindow.argtypes=[wintypes.HWND]
        user.GetClientRect.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.RECT)]
        rect=wintypes.RECT()
        return (pid.value in pids and not user.IsHungAppWindow(window)
                and bool(user.GetClientRect(window,ctypes.byref(rect)))
                and rect.right-rect.left>=640 and rect.bottom-rect.top>=360)
    except (OSError,AttributeError):return False


def focus_rocket_league():
    if sys.platform != 'win32': return False
    try: return _focus_rocket_league()
    except (OSError, AttributeError): return False


def _focus_rocket_league():
    user,window = _rocket_window()
    if not window: return False
    if user.IsIconic(window): user.ShowWindow(window, 9)
    return bool(user.SetForegroundWindow(window))


def minimize_rocket_league():
    if sys.platform != 'win32': return False
    try:
        user,window = _rocket_window()
        if not window: return False
        user.ShowWindow(window,6)
        return True
    except (OSError,AttributeError): return False


def _rocket_window():
    import ctypes
    from ctypes import wintypes
    user, kernel = ctypes.windll.user32, ctypes.windll.kernel32
    user.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
    user.IsIconic.argtypes = [wintypes.HWND]
    user.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    user.SetForegroundWindow.argtypes = [wintypes.HWND]
    kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD,
                                                wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    windows = []
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def collect(window, _):
        pid = wintypes.DWORD()
        user.GetWindowThreadProcessId(window, ctypes.byref(pid))
        process = kernel.OpenProcess(0x1000, False, pid.value)
        if process:
            try:
                length, filename = wintypes.DWORD(32768), ctypes.create_unicode_buffer(32768)
                if kernel.QueryFullProcessImageNameW(process, 0, filename, ctypes.byref(length)):
                    if filename.value.replace('\\','/').rsplit('/',1)[-1].lower() == 'rocketleague.exe':
                        # Skip child/hidden utility windows belonging to the game.
                        if user.IsWindowVisible(window): windows.append(window)
            finally: kernel.CloseHandle(process)
        return True
    user.IsWindowVisible.argtypes = [wintypes.HWND]
    user.EnumWindows.argtypes = [callback_type, wintypes.LPARAM]
    user.EnumWindows(callback_type(collect), 0)
    return user,windows[0] if windows else None
