#!/usr/bin/env python3
"""Native macOS console regression checks using an isolated, muted synthetic profile.

Build first, then run: python3 scripts/verify_console.py target/release/dih_dah_dojo
This checks software terminal behavior and history replay, not physical timing.
"""
import codecs
import fcntl
import os
import pty
import re
import select
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time

class Terminal:
    """Read Crossterm cursor-addressed output with a small VT screen model."""

    def __init__(self, binary, directory):
        self.master, slave = pty.openpty()
        self.width = 80
        self.height = 24
        self.x = self.y = 0
        self.pending = ''
        self.cells = [[' '] * self.width for _ in range(self.height)]
        self.raw = bytearray()
        self.decode = codecs.getincrementaldecoder('utf-8')('replace')
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 24, 80, 0, 0))
        env = os.environ.copy()
        env['TERM'] = 'xterm-256color'
        env['NO_COLOR'] = '1'
        self.process = subprocess.Popen([binary, 'train', '--data-dir', directory, '--plain', '--skip-readiness', '--known', 'all', '--mode', 'recognition', '--session-seconds', '1'], stdin=slave, stdout=slave, stderr=slave, env=env, start_new_session=True)
        os.close(slave)

    def parse(self, text):
        self.pending += text
        while self.pending:
            if self.pending.startswith('\x1b['):
                m = re.match('\\x1b\\[([0-9;?<>!]*)([ -/]*)([@-~])', self.pending)
                if not m:
                    return
                self.pending = self.pending[m.end():]
                raw = m[1]
                code = m[3]
                p = [int(v) if v else 0 for v in raw.replace('?', '').split(';')]
                n = p[0] or 1
                if code in 'Hf':
                    self.y = (p[0] or 1) - 1
                    self.x = (p[1] if len(p) > 1 and p[1] else 1) - 1
                elif code == 'G':
                    self.x = n - 1
                elif code == 'd':
                    self.y = n - 1
                elif code == 'A':
                    self.y -= n
                elif code == 'B':
                    self.y += n
                elif code == 'C':
                    self.x += n
                elif code == 'D':
                    self.x -= n
                elif code == 'J' and p[0] == 2:
                    self.cells = [[' '] * self.width for _ in range(self.height)]
                elif code == 'K':
                    if 0 <= self.y < self.height:
                        lo = 0 if p[0] in (1, 2) else max(0, self.x)
                        hi = self.width if p[0] in (0, 2) else self.x + 1
                        for x in range(lo, min(hi, self.width)):
                            self.cells[self.y][x] = ' '
                self.x = max(0, min(self.width - 1, self.x))
                self.y = max(0, min(self.height - 1, self.y))
                continue
            if self.pending.startswith('\x1b]'):
                end = self.pending.find('\x07')
                if end < 0:
                    return
                self.pending = self.pending[end + 1:]
                continue
            if self.pending[0] == '\x1b':
                if len(self.pending) < 2:
                    return
                self.pending = self.pending[2:]
                continue
            c = self.pending[0]
            self.pending = self.pending[1:]
            if c == '\r':
                self.x = 0
            elif c == '\n':
                self.y = min(self.height - 1, self.y + 1)
            elif c == '\x08':
                self.x = max(0, self.x - 1)
            elif c >= ' ':
                if self.x < self.width and self.y < self.height:
                    self.cells[self.y][self.x] = c
                self.x = min(self.width - 1, self.x + 1)

    def read(self, seconds=0.1):
        until = time.monotonic() + seconds
        while time.monotonic() < until:
            if select.select([self.master], [], [], min(0.03, max(0, until - time.monotonic())))[0]:
                try:
                    data = os.read(self.master, 65536)
                except OSError:
                    break
                if not data:
                    break
                self.raw.extend(data)
                self.parse(self.decode.decode(data))
        return self.text()

    def text(self):
        return '\n'.join((''.join(r) for r in self.cells))

    def wait(self, expected, timeout=10):
        end = time.monotonic() + timeout
        while time.monotonic() < end:
            self.read(0.03)
            if expected in self.text():
                return
            if self.process.poll() is not None:
                raise AssertionError('Trainer exited: ' + self.text())
        raise AssertionError('Missing ' + expected + '\n' + self.text())

    def key(self, value):
        os.write(self.master, value)
        self.read(0.06)

    def resize(self, w, h):
        self.width = w
        self.height = h
        self.cells = [[' '] * w for _ in range(h)]
        fcntl.ioctl(self.master, termios.TIOCSWINSZ, struct.pack('HHHH', h, w, 0, 0))
        os.killpg(self.process.pid, signal.SIGWINCH)
        self.read(0.15)

    def close(self):
        if self.process.poll() is None:
            self.key(b'\x03')
        self.process.wait(timeout=15)
        if self.master is not None:
            os.close(self.master)
            self.master = None
if sys.platform != 'darwin':
    raise SystemExit('This native audio regression harness requires macOS.')
binary = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else 'target/release/dih_dah_dojo')
directory = tempfile.mkdtemp(prefix='cw-console-native-')
t = Terminal(binary, directory)
try:
    t.wait('Dashboard')
    print('PASS dashboard primary action', flush=True)
    assert 'Continue Training' in t.text()
    t.key(b'2')
    t.wait('Practice launcher')
    t.key(b'\t')
    assert 'Recognition' in t.text()
    t.key(b'\x1b[Z')
    t.key(b'3')
    t.wait('Progress / observed evidence')
    assert 'No eligible blocks' in t.text()
    t.key(b'\r')
    t.wait('No eligible points')
    t.key(b'\x1b')
    t.key(b'rr')
    t.wait('latest all')
    t.key(b'\t\t\t\r')
    t.wait('Character A')
    t.key(b'\x1b[C')
    t.wait('Character B')
    t.key(b'1')
    t.wait('Dashboard')
    print('PASS section navigation / Shift-Tab / empty graphs / ranges / character drilldown', flush=True)
    t.key(b'?')
    t.wait('Console help')
    t.key(b'\x1b')
    t.wait('Dashboard')
    t.key(b'\x1b[B' * 5 + b'\r')
    t.wait('Reset local learning history')
    t.key(b'DEL\x1b')
    t.wait('Dashboard')
    print('PASS help and reset cancellation', flush=True)
    t.key(b'4')
    t.wait('Audio settings')
    os.write(t.master, b'\x1b[D' * 10)
    t.read(0.06)
    t.key(b'\r')
    t.wait('Dashboard')
    t.key(b'4')
    t.wait('Audio settings')
    t.key(b'\t\x1b[C\x1b[C\x1b[C')
    t.wait('750 Hz')
    t.wait('PLAYING PREVIEW')
    t.read(0.6)
    t.key(b' ')
    t.wait('PLAYING PREVIEW')
    t.read(0.6)
    t.key(b'\x1b[17~')
    t.wait('PLAYING PREVIEW')
    t.key(b'1')
    t.wait('Dashboard')
    print('PASS muted automatic/coalesced/Space/F6 preview and save-on-leave', flush=True)
    t.key(b'\x1b[A' * 5 + b'\r')
    t.wait('WAITING FOR RESPONSE')
    t.key(b'3')
    for delay in (0.09, 0.15, 0.15):
        t.read(delay)
        assert 'Response: 3' in t.text(), t.text()
    print('PASS digit is captured with visible answer through 450 ms', flush=True)
    t.wait('WAITING FOR RESPONSE')
    t.key(b'\t')
    t.wait('UNKNOWN')
    t.wait('WAITING FOR RESPONSE')
    t.key(b'\x1b[17~')
    t.wait('REPLAY REQUESTED')
    t.wait('WAITING FOR RESPONSE')
    t.key(b'\x1b[15~')
    t.wait('Practice paused')
    t.key(b'?')
    t.wait('Console help')
    t.key(b'\r')
    t.wait('Practice paused')
    t.key(b'\x1b[15~')
    t.read(0.2)
    t.resize(40, 12)
    t.wait('Resize to')
    t.resize(110, 30)
    t.key(b'\x1b')
    t.wait('Session saved')
    t.key(b'\r')
    t.wait('Dashboard')
    print('PASS unknown/replay/pause help/resume/resize/finish', flush=True)
    t.key(b'\r')
    deadline = time.monotonic() + 100
    answered = 0
    while time.monotonic() < deadline:
        t.read(0.025)
        if 'Recognition block saved' in t.text():
            break
        if 'WAITING FOR RESPONSE' in t.text():
            t.key(b'\t')
            answered += 1
        if 'Practice could not continue' in t.text():
            raise AssertionError(t.text())
    t.wait('Recognition block saved')
    t.key(b' ')
    t.wait('HOLD - saved result')
    t.read(4)
    assert 'Recognition block saved' in t.text()
    assert 'HOLD - saved result' in t.text()
    t.key(b' ')
    t.wait('Next block in')
    t.key(b'\x1b')
    t.wait('Session saved')
    t.key(b'\r')
    t.wait('Dashboard')
    print('PASS saved-summary hold over 4 seconds / resume / Esc', answered, 'responses', flush=True)
    t.key(b'3')
    t.wait('Progress / observed evidence')
    t.key(b'\t' * 4 + b'\r')
    t.wait('HISTORY DETAIL')
    assert 'COMPLETE' in t.text() and 'INTERRUPTED' not in t.text(), t.text()
    print('PASS held result remains complete without technical compromise', flush=True)
    t.close()
    assert b'\x1b[?1049l' in t.raw and b'\x1b[?25h' in t.raw
    assert not re.search(b'\\x1b\\[[0-9;]*(?:38|48);(?:2|5);', t.raw), 'NO_COLOR true-color escape'
    subprocess.run([binary, 'replay', '--data-dir', directory], check=True)
    print('PASS terminal restoration / NO_COLOR / binary history replay', flush=True)
    reopened = Terminal(binary, directory)
    try:
        reopened.wait('Dashboard')
        reopened.key(b'4')
        reopened.wait('Audio settings')
        assert '0%' in reopened.text() and '750 Hz' in reopened.text(), reopened.text()
    finally:
        reopened.close()
    print('PASS saved audio preferences after restart', flush=True)
    print('DIRECTORY', directory, flush=True)
    open(directory + '/terminal.ansi', 'wb').write(t.raw)
except BaseException:
    print(t.text(), file=sys.stderr)
    print('DIRECTORY', directory, file=sys.stderr)
    open(directory + '/terminal.ansi', 'wb').write(t.raw)
    t.close()
    raise
