import "package:flutter/material.dart";
import "package:logging/logging.dart";
import "package:photos/core/event_bus.dart";
import "package:photos/db/ml/clip_db.dart";
import "package:photos/db/ml/db.dart";
import "package:photos/events/people_changed_event.dart";
import "package:photos/service_locator.dart";
import "package:photos/services/machine_learning/semantic_search/semantic_search_service.dart";
import "package:photos/theme/ente_theme.dart";
import "package:photos/ui/components/buttons/button_widget.dart";
import "package:photos/ui/components/captioned_text_widget.dart";
import "package:photos/ui/components/menu_item_widget/menu_item_widget.dart";
import "package:photos/ui/components/models/button_type.dart";
import "package:photos/ui/components/title_bar_title_widget.dart";
import "package:photos/ui/components/title_bar_widget.dart";
import "package:photos/ui/components/toggle_switch_widget.dart";
import "package:photos/utils/dialog_util.dart";
import "package:photos/utils/toast_util.dart";

final Logger _logger = Logger("MLUserDeveloperOptions");

class MLUserDeveloperOptions extends StatefulWidget {
  const MLUserDeveloperOptions({super.key});

  @override
  State<MLUserDeveloperOptions> createState() => _MLUserDeveloperOptionsState();
}

class _MLUserDeveloperOptionsState extends State<MLUserDeveloperOptions> {
  @override
  Widget build(BuildContext context) {
    final colorScheme = getEnteColorScheme(context);
    return Scaffold(
      body: CustomScrollView(
        primary: false,
        slivers: <Widget>[
          const TitleBarWidget(
            flexibleSpaceTitle: TitleBarTitleWidget(
              title: "ML debug options",
            ),
          ),
          SliverList(
            delegate: SliverChildBuilderDelegate(
              (delegateBuildContext, index) => Padding(
                padding: const EdgeInsets.only(left: 16, right: 16),
                child: Column(
                  children: [
                    Text(
                      "Only use if you know what you're doing",
                      textAlign: TextAlign.left,
                      style: getEnteTextTheme(context).body.copyWith(
                            color: getEnteColorScheme(context).textMuted,
                          ),
                    ),
                    const SizedBox(height: 48),
                    ButtonWidget(
                      buttonType: ButtonType.neutral,
                      labelText: "Purge empty indices",
                      onTap: () async {
                        await deleteEmptyIndices(context);
                      },
                    ),
                    const SizedBox(height: 24),
                    ButtonWidget(
                      buttonType: ButtonType.neutral,
                      labelText: "Reset all local ML",
                      onTap: () async {
                        await deleteAllLocalML(context);
                      },
                    ),
                    const SizedBox(height: 24),
                    MenuItemWidget(
                      captionedTextWidget: const CaptionedTextWidget(
                        title: "Remote fetch",
                      ),
                      menuItemColor: colorScheme.fillFaint,
                      trailingWidget: ToggleSwitchWidget(
                        value: () => localSettings.remoteFetchEnabled,
                        onChanged: () async {
                          try {
                            await localSettings.toggleRemoteFetch();
                            _logger.info('Remote fetch is turned ${localSettings.remoteFetchEnabled ? 'on' : 'off'}');
                            if (mounted) {
                              setState(() {});
                            }
                          } catch (e, s) {
                            _logger.warning(
                              'Remote fetch toggle failed ',
                              e,
                              s,
                            );
                            await showGenericErrorDialog(
                              context: context,
                              error: e,
                            );
                          }
                        },
                      ),
                      singleBorderRadius: 8,
                      alignCaptionedTextToLeft: true,
                      isBottomBorderRadiusRemoved: true,
                      isGestureDetectorDisabled: true,
                    ),
                    const SafeArea(
                      child: SizedBox(
                        height: 12,
                      ),
                    ),
                  ],
                ),
              ),
              childCount: 1,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> deleteEmptyIndices(BuildContext context) async {
    try {
      final Set<int> emptyFileIDs = await MLDataDB.instance.getErroredFileIDs();
      await MLDataDB.instance.deleteFaceIndexForFiles(emptyFileIDs.toList());
      await MLDataDB.instance.deleteClipEmbeddings(emptyFileIDs.toList());
      showShortToast(context, "Deleted ${emptyFileIDs.length} entries");
    } catch (e) {
      // ignore: unawaited_futures
      showGenericErrorDialog(
        context: context,
        error: e,
      );
    }
  }

  Future<void> deleteAllLocalML(BuildContext context) async {
    try {
      await MLDataDB.instance.dropClustersAndPersonTable(faces: true);
      await SemanticSearchService.instance.clearIndexes();
      Bus.instance.fire(PeopleChangedEvent());
      showShortToast(context, "All local ML cleared");
    } catch (e) {
      // ignore: unawaited_futures
      showGenericErrorDialog(
        context: context,
        error: e,
      );
    }
  }
}
