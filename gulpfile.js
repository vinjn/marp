/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
let gulp;
module.exports = gulp = require("gulp");

const $ = require("gulp-load-plugins")();
const config = require("./package.json");
const del = require("del");
const packager = require("electron-packager");
const runSequence = require("run-sequence");
const Path = require("path");
const extend = require("extend");
const mkdirp = require("mkdirp");

const packageOpts = {
  asar: true,
  dir: "dist",
  out: "packages",
  name: config.productName,
  version: config.devDependencies["electron"],
  prune: false,
  overwrite: true,
  "app-bundle-id": "jp.yhatt.marp",
  "app-version": config.version,
  "version-string": {
    ProductName: config.productName,
    InternalName: config.productName,
    FileDescription: config.productName,
    CompanyName: "yhatt",
    LegalCopyright: "",
    OriginalFilename: `${config.productName}.exe`,
  },
};

const packageElectron = function (opts, done) {
  if (opts == null) {
    opts = {};
  }
  packager(extend(packageOpts, opts), function (err) {
    if (err) {
      if (err.syscall === "spawn wine") {
        $.util.log("Packaging failed. Please install wine.");
      } else {
        throw err;
      }
    }

    if (done != null) {
      return done();
    }
  });
};

const globFolders = function (pattern, func, callback) {
  let doneTasks = 0;
  const g = new (require("glob").Glob)(pattern, function (err, pathes) {
    if (err) {
      throw err;
    }
    const done = function () {
      doneTasks++;
      if (callback != null && doneTasks >= pathes.length) {
        return callback();
      }
    };

    if (pathes.length > 0) {
      return Array.from(pathes).map((path) => func(path, done));
    } else {
      return callback();
    }
  });

  // https://github.com/SBoudrias/gulp-istanbul/issues/22
};

gulp.task("clean", ["clean:js", "clean:css", "clean:dist", "clean:packages"]);
gulp.task("clean:js", () => del(["js/**/*", "js"]));
gulp.task("clean:css", () => del(["css/**/*", "css"]));
gulp.task("clean:dist", () => del(["dist/**/*", "dist"]));
gulp.task("clean:packages", () => del(["packages/**/*", "packages"]));
gulp.task("clean:releases", () => del(["releases/**/*", "releases"]));

gulp.task("compile", ["compile:sass"]);
gulp.task("compile:production", ["compile:sass:production"]);

gulp.task("watch", () =>
  gulp.watch("{js,sass}/**/*", ["compile"], (event) =>
    console.log(
      "File " + event.path + " was " + event.type + ", running tasks..."
    )
  )
);

gulp.task("compile:sass", function () {
  gulp
    .src(["sass/**/*.scss", "sass/**/*.sass"])
    .pipe($.plumber())
    .pipe($.sourcemaps.init())
    .pipe($.sass())
    .pipe($.sourcemaps.write())
    .pipe(gulp.dest("css"));
  return gulp.src(["resources/katex/fonts/*"]).pipe(gulp.dest("css/fonts"));
});

gulp.task("compile:sass:production", ["clean:css"], function () {
  gulp
    .src(["sass/**/*.scss", "sass/**/*.sass"])
    .pipe($.sass())
    .pipe(
      $.cssnano({
        zindex: false,
      })
    )
    .pipe(gulp.dest("css"));
  return gulp.src(["resources/katex/fonts/*"]).pipe(gulp.dest("css/fonts"));
});

gulp.task("dist", ["clean:dist"], () =>
  gulp
    .src(
      [
        "js/**/*",
        "css/**/*",
        "images/**/*",
        "examples/**/*",
        "*.js",
        "!gulpfile.js",
        "*.html",
        "package.json",
        "example.md",
        "LICENSE",
        "yarn.lock",
      ],
      { base: "." }
    )
    .pipe(gulp.dest("dist"))
    .pipe(
      $.install({
        commands: {
          "package.json": "yarn",
        },
        yarn: ["--production", "--ignore-optional", "--no-bin-links"],
      })
    )
);

gulp.task("package", ["clean:packages", "dist"], (done) =>
  runSequence("package:win32", "package:darwin", "package:linux", done)
);

gulp.task("package:win32", (done) =>
  packageElectron(
    {
      platform: "win32",
      arch: "ia32,x64",
      icon: Path.join(__dirname, "resources/windows/marp.ico"),
    },
    done
  )
);

gulp.task("package:linux", (done) =>
  packageElectron(
    {
      platform: "linux",
      arch: "ia32,x64",
    },
    done
  )
);

gulp.task("package:darwin", (done) =>
  packageElectron(
    {
      platform: "darwin",
      arch: "x64",
      icon: Path.join(__dirname, "resources/darwin/marp.icns"),
    },
    () =>
      gulp
        .src(
          [`packages/*-darwin-*/${config.productName}.app/Contents/Info.plist`],
          { base: "." }
        )
        .pipe(
          $.plist({
            CFBundleDocumentTypes: [
              {
                CFBundleTypeExtensions: ["md", "mdown"],
                CFBundleTypeIconFile: "",
                CFBundleTypeName: "Markdown file",
                CFBundleTypeRole: "Editor",
                LSHandlerRank: "Owner",
              },
            ],
          })
        )
        .pipe(gulp.dest("."))
  )
);

gulp.task("build", (done) =>
  runSequence("compile:production", "package", done)
);
gulp.task("build:win32", (done) =>
  runSequence("compile:production", "dist", "package:win32", done)
);
gulp.task("build:linux", (done) =>
  runSequence("compile:production", "dist", "package:linux", done)
);
gulp.task("build:darwin", (done) =>
  runSequence("compile:production", "dist", "package:darwin", done)
);

gulp.task("archive", ["archive:win32", "archive:darwin", "archive:linux"]);

gulp.task("archive:win32", (done) =>
  globFolders(
    "packages/*-win32-*",
    (path, globDone) =>
      gulp
        .src([`${path}/**/*`])
        .pipe($.zip(`${config.version}-${Path.basename(path, ".*")}.zip`))
        .pipe(gulp.dest("releases"))
        .on("end", globDone),
    done
  )
);

gulp.task("archive:darwin", function (done) {
  let err;
  const appdmg = (() => {
    try {
      return require("appdmg");
    } catch (error) {
      err = error;
      return null;
    }
  })();

  if (!appdmg) {
    $.util.log("Archiving for darwin is supported only macOS.");
    return done();
  }

  return globFolders(
    "packages/*-darwin-*",
    function (path, globDone) {
      const release_to = Path.join(
        __dirname,
        `releases/${config.version}-${Path.basename(path, ".*")}.dmg`
      );

      return mkdirp(Path.dirname(release_to), (err) =>
        del(release_to).then(function () {
          const running_appdmg = appdmg({
            target: release_to,
            basepath: Path.join(__dirname, path),
            specification: {
              title: config.productName,
              background: Path.join(
                __dirname,
                "resources/darwin/dmg-background.png"
              ),
              "icon-size": 80,
              window: {
                position: { x: 90, y: 90 },
                size: { width: 624, height: 412 },
              },
              contents: [
                {
                  x: 210,
                  y: 300,
                  type: "file",
                  path: `${config.productName}.app`,
                },
                { x: 410, y: 300, type: "link", path: "/Applications" },
              ],
            },
          });
          return running_appdmg.on("finish", globDone);
        })
      );
    },
    done
  );
});

gulp.task("archive:linux", (done) =>
  globFolders(
    "packages/*-linux-*",
    (path, globDone) =>
      gulp
        .src([`${path}/**/*`])
        .pipe($.tar(`${config.version}-${Path.basename(path, ".*")}.tar`))
        .pipe($.gzip())
        .pipe(gulp.dest("releases"))
        .on("end", globDone),
    done
  )
);

gulp.task("release", (done) => runSequence("build", "archive", "clean", done));
